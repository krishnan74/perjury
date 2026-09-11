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
 *      in the deployment, works on any host, filed under the registry that
 *      issued them because claim ids restart at one with every cascade.
 *   2. The shared store, for claims created after the deployment was built.
 *
 * Layer 2 used to be a file in `/tmp`, which is private to one instance: a write
 * and a later read could land on different machines, and the failure looked like
 * evidence that had never been published. See ./live/store.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { get, set } from "./live/store";

/**
 * Committed, ships with the build, filed under the registry that issued the
 * claims.
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
 * Keyed by registry as well as claim id.
 *
 * Claim ids restart at one with every cascade, so `gateway:1` names a different
 * claim after each redeploy and the newer write silently replaces the older
 * one. That is the same collision that overwrote an archived bundle on disk, and
 * it survived here because the store was added after the directory layout was
 * fixed.
 *
 * The registry comes from this deployment's own environment rather than from the
 * caller, so a client cannot write into another deployment's namespace by
 * claiming to be it.
 */
const key = (claimId: string) =>
  `gateway:${(process.env.CLAIM_REGISTRY_ADDRESS ?? "unknown").toLowerCase()}:${claimId}`;

function committed(): Record<string, string> {
  try {
    if (!existsSync(COMMITTED)) return {};
    return JSON.parse(readFileSync(COMMITTED, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** The URL a claim's sealed evidence was published to, or null. */
export async function gatewayUrlFor(claimId: string): Promise<string | null> {
  // The store wins. A claim can only be in both if it was re-published, and the
  // newer publish is the one the tribunal should read.
  const live = await get(key(claimId));
  if (live) return live;
  return committed()[claimId] ?? null;
}

/** Record where a claim's evidence went. */
export const recordGatewayUrl = (claimId: string, url: string): Promise<void> =>
  set(key(claimId), url);

/** Claims that shipped with this build. Used where a list is more useful than a lookup. */
export const committedClaimIds = (): string[] =>
  Object.keys(committed()).sort((a, b) => Number(a) - Number(b));
