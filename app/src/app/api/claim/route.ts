/**
 * One step of a claim per request.
 *
 * `POST /api/claim` with `{ step, ... }`. Every step returns the whole run state
 * so the browser never has to assemble it from fragments, and every step is
 * short — the waiting happens in the browser between calls, not inside a
 * function holding a connection open.
 *
 * The steps are deliberately not idempotent-by-accident: each checks the phase
 * it expects and returns unchanged if the run has moved past it, so a retry
 * after a dropped response cannot post a second claim.
 */
import { NextResponse } from "next/server";
import { assignment, draft, finalize, loadRun, runWitness, submit, verdict } from "@/lib/live/run";
import { configuredAgents } from "@/lib/live/chain";
import { isPinnedSubject } from "@/lib/subjects";
import { runCapability } from "@/lib/live-run";
import { acquireLock, gateEnabled, passwordOk, releaseLock, spendFromBudget } from "@/lib/live/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * The longest single step is the claimant or the witness reading the indexer and
 * reasoning about it. Well under the serverless ceiling, which is the point of
 * splitting the run up at all.
 */
export const maxDuration = 300;

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const authorised = passwordOk(request.headers.get("x-perjury-password"));
  if (!authorised) return bad("wrong or missing password", 401);

  /*
   * Name the missing credential only to someone holding the password.
   *
   * This check used to sit behind a password that was always set, so listing
   * what a deployment lacks was a message to the operator. With the gate open —
   * which is how the judged deployment runs — the same list is an inventory of
   * this server's gaps, published to anyone who presses the button. The
   * unconfigured case is rare and the reader needs to know it cannot run, not
   * which key is absent.
   */
  const capability = runCapability();
  if (!capability.ok) {
    return bad(
      gateEnabled()
        ? `this deployment cannot run a claim: missing ${capability.missing.join(", ")}`
        : "live submission is not configured on this deployment",
      503,
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { step?: string; runId?: string; subject?: string; claimant?: string }
    | null;
  if (!body?.step) return bad("step is required");

  try {
    switch (body.step) {
      case "draft": {
        // Both are matched against a known set rather than sanitised. A list of
        // thirteen subjects does not need an escaping rule that can be got wrong.
        if (!body.subject || !isPinnedSubject(body.subject)) return bad(`unknown subject: ${body.subject}`);
        if (!body.claimant || !configuredAgents().includes(body.claimant)) {
          return bad(`unknown or unconfigured agent: ${body.claimant}`);
        }
        // Taken before any work, so a second visitor is refused rather than
        // told to wait after the model call has already been paid for.
        if (!(await acquireLock("pending"))) {
          return bad("a claim is already running — one at a time, so the bonds do not collide", 409);
        }
        // Charged before the model call, and the lock is handed back on refusal
        // so a spent budget does not also look like a stuck queue.
        const spent = await spendFromBudget();
        if (!spent) {
          await releaseLock();
          return bad(
            "today's live-claim budget is spent — this page pays for a real model call and real gas on every run, so it is capped per day rather than gated behind a password. It resets at 00:00 UTC. Everything already settled is still replayable.",
            429,
          );
        }
        const state = await draft(body.subject, body.claimant);
        await acquireLock(state.runId);
        return NextResponse.json(state);
      }
      case "submit":
      case "assignment":
      case "witness":
      case "verdict":
      case "finalize": {
        if (!body.runId) return bad("runId is required");
        const fn = { submit, assignment, witness: runWitness, verdict, finalize }[body.step];
        const next = await fn(body.runId);
        // The claim is done with the wallets once it settles, so the next
        // visitor should not wait out the lock's expiry.
        if (next.phase === "settled") await releaseLock();
        return NextResponse.json(next);
      }
      default:
        return bad(`unknown step: ${body.step}`);
    }
  } catch (err) {
    // The message is the useful part and it is not secret — a revert reason, a
    // missing key, an indexer that disagreed with itself.
    return bad((err as Error).message, 500);
  }
}

/** Read a run back, for a reader who reloaded the page mid-claim. */
export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) return bad("runId is required");
  const state = await loadRun(runId);
  return state ? NextResponse.json(state) : bad("unknown run", 404);
}
