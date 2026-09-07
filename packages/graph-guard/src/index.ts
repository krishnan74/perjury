// Provenance and freshness enforcement for every Graph read. See docs/design.md §5.3.
//
// This layer is deliberately deterministic and LLM-free: an agent cannot be
// trusted to report honestly on whether its own data was stale, so the check
// lives outside it. A failure here produces Unverifiable, never a silent pass.
import {
  type Attestation,
  type Provenance,
  type TypedAssertion,
  UnverifiableError,
  canonicalize,
  digestOf,
  sha256,
} from "@perjury/shared";

/** Blocks the indexed head may lag the chain head before data is untrustworthy. */
export const FRESHNESS_BLOCKS = 50;

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

  return {
    deploymentId: deployment,
    indexedBlock: block.number,
    chainHead: res.chainHead,
    queriedAt: now,
    queryHash: sha256(canonicalize({ q: res.queryDocument, v: res.variables })),
    hasIndexingErrors,
  };
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
