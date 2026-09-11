/**
 * Start a real claim and stream what happens.
 *
 * This spawns the same runner the recorded scenes use. Nothing here is a
 * simulation of a run: a claim is submitted on Sepolia with a real bond, VRF
 * really draws a witness, the witness really reads the indexer, and the verdict
 * really settles. The only thing the browser adds is a view of it.
 *
 * It streams rather than returning, because the interesting part is the waiting.
 * A claim takes minutes, most of it spent on the VRF draw and the challenge
 * window, and a page that showed a spinner for four minutes and then a verdict
 * would be hiding the mechanism it exists to explain.
 *
 * Requires a real Node process with the repository on disk, because the runner
 * shells out to the agents. A serverless deployment cannot serve this route;
 * see docs/partner-integrations.md for what that costs and why it was accepted.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { isPinnedSubject } from "@/lib/subjects";
import { runCapability } from "@/lib/live-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A claim takes minutes. Next would otherwise cut the stream long before then. */
export const maxDuration = 900;

/**
 * One run at a time, process-wide.
 *
 * Not a performance guard. Every run posts a bond from a funded agent wallet, so
 * an unguarded public endpoint is a way to drain them, and two claimants racing
 * for the same next claim id produces one transaction that reverts. The lock is
 * the cheapest correct answer to both.
 */
let running = false;

const REPO = join(process.cwd(), "..");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? "aave-v3-ethereum";
  const claimant = url.searchParams.get("claimant") ?? "operator";

  // Never pass a caller's string to a spawned process. Both of these are
  // matched against a known set rather than escaped, because a list of thirteen
  // subjects does not need a quoting rule that can be got wrong.
  if (!isPinnedSubject(subject)) {
    return Response.json({ error: `unknown subject: ${subject}` }, { status: 400 });
  }
  const AGENTS = ["operator", "witness-a", "panel-1", "panel-2", "panel-3"];
  if (!AGENTS.includes(claimant)) {
    return Response.json({ error: `unknown agent: ${claimant}` }, { status: 400 });
  }

  // Same check the page makes, repeated here because a route is reachable
  // without the page and a 503 saying why beats a stack trace.
  const capability = runCapability();
  if (!capability.ok) {
    return Response.json(
      { error: `this deployment cannot run a claim: missing ${capability.missing.join(", ")}` },
      { status: 503 },
    );
  }

  if (running) {
    return Response.json(
      { error: "a claim is already running — one at a time, so the bonds do not collide" },
      { status: 409 },
    );
  }
  running = true;

  const child = spawn(
    "npx",
    ["tsx", "agents/runner/scene1.ts", claimant, `--subject=${subject}`],
    { cwd: REPO, env: process.env },
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("start", { subject, claimant, at: Date.now() });

      // The runner writes for a terminal, so it paints spinners with carriage
      // returns and colours with escape codes. Both are stripped here: a spinner
      // frame is not a line of output, and re-rendering one in HTML produces a
      // page that grows by a line every 200ms.
      let buffer = "";
      const onChunk = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw
            // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI is the point
            .replace(/\[[0-9;]*m/g, "")
            .replace(/.*\r/, "")
            .trimEnd();
          if (line.trim()) send("line", { line });
        }
      };

      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);

      child.on("close", (code) => {
        if (buffer.trim()) send("line", { line: buffer });
        send("done", { code, at: Date.now() });
        running = false;
        controller.close();
      });

      child.on("error", (err) => {
        send("line", { line: `runner failed to start: ${err.message}` });
        send("done", { code: 1, at: Date.now() });
        running = false;
        controller.close();
      });

      // A reader that navigates away should not leave a claim half-posted with
      // nobody watching, but killing mid-transaction is worse than finishing.
      // So the run continues and only the stream ends.
      request.signal.addEventListener("abort", () => {
        try {
          controller.close();
        } catch {
          // Already closed by the close handler above.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
