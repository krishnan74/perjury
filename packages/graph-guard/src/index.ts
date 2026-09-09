// Provenance and freshness enforcement for every Graph read. See docs/design.md §5.3.
//
// This layer is deliberately deterministic and LLM-free: an agent cannot be
// trusted to report honestly on whether its own data was stale, so the check
// lives outside it. A failure here produces Unverifiable, never a silent pass.
import {
  type Attestation,
  type Corroboration,
  type Provenance,
  type TypedAssertion,
  UnverifiableError,
  canonicalize,
  digestOf,
  sha256,
} from "@perjury/shared";

/** Blocks the indexed head may lag the chain head before data is untrustworthy. */
export const FRESHNESS_BLOCKS = 50;

/**
 * How far independently-indexed deployments may disagree before the reading is
 * treated as contested.
 *
 * This MUST NOT exceed the tribunal's adjudication tolerance. If it did, two
 * deployments could differ by more than the amount that decides a verdict while
 * still counting as corroborated — and then which source an agent happened to
 * read would determine whether someone loses a bond. Keeping it at or below the
 * adjudication tolerance is what makes the choice of source immaterial.
 */
export const CORROBORATION_BPS = 50;

/**
 * Blocks apart two deployments may be and still be comparable. Beyond this,
 * divergence cannot be attributed to the mapping code rather than to time, so
 * there is nothing to conclude either way.
 */
export const CORROBORATION_MAX_SKEW = 25;

export interface PinnedDeployment {
  subject: string;
  deploymentId: string;
  /** Optional fallback used when the primary lags — see docs/design.md §5.3. */
  backupDeploymentId?: string;
}

export interface GraphMeta {
  deployment: string;
  block: { number: number };
  hasIndexingErrors: boolean;
}

export interface RawGraphResponse {
  _meta?: GraphMeta;
  chainHead: number;
  queryDocument: string;
  variables: Record<string, unknown>;
  data: unknown;
}

/**
 * Validate a live Graph response against its pinned deployment and freshness
 * window. Throws UnverifiableError rather than returning a degraded result.
 */
export function guard(
  res: RawGraphResponse,
  pinned: PinnedDeployment,
  now: number = Date.now(),
  freshnessBlocks: number = FRESHNESS_BLOCKS,
): Provenance {
  if (!res._meta) {
    throw new UnverifiableError("missing-meta", "response carried no _meta block");
  }
  const { deployment, block, hasIndexingErrors } = res._meta;

  const accepted = [pinned.deploymentId, pinned.backupDeploymentId].filter(Boolean);
  if (!accepted.includes(deployment)) {
    // A subgraph silently redeployed under the same name is exactly the
    // substitution this catches.
    throw new UnverifiableError(
      "deployment-mismatch",
      `deployment ${deployment} is not pinned for ${pinned.subject}`,
    );
  }
  if (hasIndexingErrors) {
    throw new UnverifiableError("indexing-errors", "subgraph reports indexing errors");
  }
  const lag = res.chainHead - block.number;
  if (lag > freshnessBlocks) {
    throw new UnverifiableError("stale-index", `index lags head by ${lag} blocks`);
  }
  if (res.data === null || res.data === undefined) {
    throw new UnverifiableError("no-data", "query returned no data");
  }
  // An empty result set is not data. A query whose filter matched nothing looks
  // successful — `{ lendingProtocols: [] }` is a valid response — and would let a
  // caller derive a finding from nothing. Treat it as unverifiable.
  const payload = res.data as Record<string, unknown>;
  const substantive = Object.entries(payload).filter(([k]) => k !== "_meta");
  if (substantive.length === 0) {
    throw new UnverifiableError("no-data", "response contained only _meta");
  }
  const allEmpty = substantive.every(
    ([, v]) => v === null || v === undefined || (Array.isArray(v) && v.length === 0),
  );
  if (allEmpty) {
    throw new UnverifiableError(
      "no-data",
      `query matched nothing: ${substantive.map(([k]) => k).join(", ")} empty`,
    );
  }

  return {
    deploymentId: deployment,
    indexedBlock: block.number,
    chainHead: res.chainHead,
    queriedAt: now,
    queryHash: sha256(canonicalize({ q: res.queryDocument, v: res.variables })),
    hasIndexingErrors,
  };
}

/** One independently-indexed reading of the same subject. */
export interface CorroboratingRead {
  provenance: Provenance;
  /** The value derived from this deployment, by the same derivation used on the primary. */
  value: number;
}

/** Relative gap between two readings, in basis points. */
function divergenceBps(a: number, b: number): number {
  if (a === b) return 0;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return 0;
  return (Math.abs(a - b) / scale) * 10_000;
}

/**
 * Cross-check a reading against independently-indexed deployments of the same
 * protocol and schema.
 *
 * Divergence here is NOT anyone's fault: it means the protocols' own indexers
 * disagree about what the chain says, so the underlying fact is contested and no
 * claimant can be convicted on it. That is why this throws Unverifiable rather
 * than resolving to a majority — picking a winner among disagreeing indexers
 * would invent a fact the data layer does not support.
 *
 * A single source is not a failure. Plurality does not exist for most protocols
 * yet, so single-source reads are recorded as such and carried into the verdict
 * rather than rejected — the limitation stays visible instead of hidden.
 */
export function corroborate(
  primary: CorroboratingRead,
  others: CorroboratingRead[],
  toleranceBps: number = CORROBORATION_BPS,
  maxSkew: number = CORROBORATION_MAX_SKEW,
): Corroboration {
  const all = [primary, ...others];
  const deploymentIds = all.map((r) => r.provenance.deploymentId);

  if (others.length === 0) {
    return { sources: 1, deploymentIds, maxDivergenceBps: 0, corroborated: false };
  }

  let maxDivergenceBps = 0;
  for (const other of others) {
    const skew = Math.abs(primary.provenance.indexedBlock - other.provenance.indexedBlock);
    if (skew > maxSkew) {
      throw new UnverifiableError(
        "corroboration-divergence",
        `deployments ${skew} blocks apart (max ${maxSkew}) — not comparable`,
      );
    }
    maxDivergenceBps = Math.max(maxDivergenceBps, divergenceBps(primary.value, other.value));
  }

  if (maxDivergenceBps > toleranceBps) {
    throw new UnverifiableError(
      "corroboration-divergence",
      `independent deployments disagree by ${maxDivergenceBps.toFixed(1)} bps ` +
        `(max ${toleranceBps}): ${deploymentIds.join(" vs ")}`,
    );
  }

  return { sources: all.length, deploymentIds, maxDivergenceBps, corroborated: true };
}

/** Guard a read and bind it to the assertion the agent derived from it. */
export function attest(
  res: RawGraphResponse,
  pinned: PinnedDeployment,
  assertion: TypedAssertion,
  now?: number,
): Attestation {
  const provenance = guard(res, pinned, now);
  if (assertion.asOfBlock !== provenance.indexedBlock) {
    throw new UnverifiableError(
      "stale-index",
      `assertion claims block ${assertion.asOfBlock} but data was indexed at ${provenance.indexedBlock}`,
    );
  }
  return { provenance, assertion, digest: digestOf(provenance, assertion) };
}

export function isUnverifiable(err: unknown): err is UnverifiableError {
  return err instanceof UnverifiableError;
}
