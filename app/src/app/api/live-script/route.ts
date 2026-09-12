/**
 * The in-flight claim, in exactly the shape the replay renders.
 *
 *   GET /api/live-script?runId=…
 *
 * `/submit` used to render its own numbered list of six steps. That was a
 * second, thinner account of the same protocol, and the two drifted: the replay
 * could show which rows an agent read and the live page could only say that it
 * had read some. Worse, the version a judge watches happen in real time was the
 * less convincing of the two.
 *
 * So there is one account now. This route calls the same `buildScript` the
 * replay page calls, against the claim that is currently running, and returns
 * whatever is true so far. No new builder and no live-only shapes — every
 * builder underneath already returns null for a stage that has not happened, so
 * a claim three beats in produces a three-beat script rather than an error.
 *
 * The only thing the live page does differently is that it never compresses a
 * gap. The replay divides by a speed multiplier; here the waiting is the point,
 * because the viewer is watching it elapse.
 */
import { NextResponse } from "next/server";

import { REGISTRY_ABI, claimEvents, claimsIndex, mechanismEvents, pub } from "@/lib/perjury";
import { currentDeployment } from "@/lib/deployments";
import { rosterSnapshot } from "@/lib/roster";
import { buildScript } from "@/lib/replay";
import { claimTextVerified, readArchiveAsync, readToleranceBps } from "@/lib/evidence";
import { loadRun } from "@/lib/live/run";

/** Reads only, and always the current chain — never a cached render. */
export const dynamic = "force-dynamic";

/**
 * How far back to scan, when the claim's own block is not known yet.
 *
 * A live claim is minutes old, so the day-wide window the dashboard uses is
 * thousands of blocks of nothing — and this route is polled every few seconds
 * for the length of a run. Narrowing it is the difference between a poll that
 * costs one round trip and one that costs twenty.
 */
const FALLBACK_LOOKBACK = 600n;
/** A little before the submit, so the submit itself is inside the window. */
const SLACK = 20n;

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const run = await loadRun(runId);
  if (!run) return NextResponse.json({ error: "unknown run" }, { status: 404 });
  // Before the bond is posted there is no claim on chain and nothing to build a
  // script from. Not an error — the first beat has not happened yet.
  if (!run.claimId) return NextResponse.json({ script: null });

  const deployment = currentDeployment();

  // Scan from the claim's own submit block. The transaction is the earliest
  // thing this claim can have emitted, so nothing is missed by starting there.
  let lookback = FALLBACK_LOOKBACK;
  if (run.submitTx) {
    const receipt = await pub.getTransactionReceipt({ hash: run.submitTx }).catch(() => null);
    if (receipt) {
      const head = await pub.getBlockNumber();
      lookback = head - receipt.blockNumber + SLACK;
    }
  }

  const [events, mechanism, roster] = await Promise.all([
    claimEvents(lookback, deployment),
    mechanismEvents(lookback, deployment),
    rosterSnapshot(deployment),
  ]);

  const chosen = claimsIndex(events).find((r) => r.id === run.claimId);
  if (!chosen) return NextResponse.json({ script: null });

  // Available from the moment the witness half is sealed, because that step
  // archives the bundle. Until then the read cards are simply absent, which is
  // the truth: the witness has not read anything yet.
  const archive = await readArchiveAsync(chosen.id, deployment.registry);
  const stored = await pub
    .readContract({
      address: deployment.registry,
      abi: REGISTRY_ABI,
      functionName: "claimOf",
      args: [BigInt(chosen.id)],
    })
    .catch(() => null);
  const claimTextOk = archive && stored ? claimTextVerified(archive, stored.claimHash) : null;

  return NextResponse.json({
    script: buildScript(chosen, mechanism, roster, archive, claimTextOk, readToleranceBps()),
  });
}
