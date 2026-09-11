/**
 * Claim id → the URL its sealed evidence actually lives at.
 *
 * The workflow used to be handed a single gateway URL in its deploy-time config.
 * Now that it finds its own claim it cannot be handed anything, so the address
 * has to be derivable from a claim id, and something has to know which store
 * holds which claim. That is all this is.
 *
 * The evidence itself stays where it was published. This maps, it does not hold
 * — which matters more than it looks. If this server held the bytes, the only
 * copy of both agents' work would sit on the same machine that runs the agents,
 * and "we could have fed the tribunal a fixture" would be an awkward question
 * with no answer. Pointing at a third-party store keeps the bytes fetchable by
 * anyone, from somewhere we do not control, and byte-comparable with what the
 * enclave read.
 *
 * Two layers, because live claims and recorded ones have different lifetimes:
 *
 *   1. A committed index, for claims that already happened. Read-only, present
 *      in the deployment, works on any host.
 *   2. A writable overlay, for claims created after the deployment was built.
 *      Written by the submit route in the same process that publishes the gist.
 *
 * The overlay is per-instance. A host that spreads requests across instances can
 * answer a fetch from an instance that never saw the write, which shows up as a
 * 404 and resolves itself when the enclave retries against a warm one. Good
 * enough for a demo running one server; not what you would build to run this for
 * real, and that is written down rather than discovered later.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Committed, ships with the build, and filed under the registry that issued the
 * claims — because claim ids restart at one with every cascade, so an id alone
 * names two different claims.
 *
 * Only the live registry is served here. The archived cascade's evidence is read
 * from disk by the replay page and never fetched by a workflow, because its sink
 * cannot accept a report any more.
 */
const COMMITTED = join(
  process.cwd(),
  "..",
  "evidence-archive",
  (process.env.CLAIM_REGISTRY_ADDRESS ?? "").toLowerCase(),
  "gateway-index.json",
);

/**
 * Writable, per-instance. `/tmp` because a serverless filesystem is read-only
 * everywhere else, and because losing it costs a retry rather than the evidence.
 */
const OVERLAY = process.env.PERJURY_GATEWAY_INDEX ?? "/tmp/perjury-gateway-index.json";

type Index = Record<string, string>;

function read(path: string): Index {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8")) as Index;
  } catch {
    // A corrupt or unreadable index must not take the route down with it. An
    // empty layer produces a 404, which the caller already knows how to retry.
    return {};
  }
}

/** The URL a claim's sealed evidence was published to, or null. */
export function gatewayUrlFor(claimId: string): string | null {
  const overlay = read(OVERLAY);
  if (overlay[claimId]) return overlay[claimId];
  const committed = read(COMMITTED);
  return committed[claimId] ?? null;
}

/** Record where a claim's evidence went. Overlay only — the committed file is an artifact. */
export function recordGatewayUrl(claimId: string, url: string): void {
  const overlay = read(OVERLAY);
  overlay[claimId] = url;
  mkdirSync(dirname(OVERLAY), { recursive: true });
  writeFileSync(OVERLAY, `${JSON.stringify(overlay, null, 2)}\n`);
}

/** Every claim this instance can serve. Used by the submit page to show progress. */
export function knownClaimIds(): string[] {
  return [...new Set([...Object.keys(read(COMMITTED)), ...Object.keys(read(OVERLAY))])].sort(
    (a, b) => Number(a) - Number(b),
  );
}
