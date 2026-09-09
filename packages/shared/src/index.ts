// Shared types for claims, findings, and provenance. See docs/design.md §3.2 and §5.3.
import { createHash } from "node:crypto";

/** Verdicts mirror the on-chain enum in contracts/src/interfaces/IPerjury.sol. */
export const Verdict = { None: 0, Match: 1, Mismatch: 2, Unverifiable: 3 } as const;
export type VerdictValue = (typeof Verdict)[keyof typeof Verdict];

export type Comparator = "eq" | "gt" | "gte" | "lt" | "lte";

/**
 * The canonical form both claimant and witness reduce to. Comparison happens on
 * this shape and nothing else — it is what makes two independently-derived
 * answers comparable without the parties agreeing a schema in advance.
 */
export interface TypedAssertion {
  subject: string;
  /**
   * Chain the reading came from. Carried on the assertion because the tribunal
   * judges block skew, and a block count means different things per chain —
   * 25 blocks is five minutes on Ethereum and six seconds on Arbitrum.
   */
  chain: string;
  metric: string;
  comparator: Comparator;
  value: number;
  unit: string;
  asOfBlock: number;
}

/**
 * How many independently-indexed deployments produced the same value.
 *
 * A deployment id is a content hash of the mapping code, so two deployments of
 * the same protocol are two independent derivations of the same chain state.
 * Reading only one means claimant and witness re-derive the *query* but share
 * the *derivation* — a mapping bug produces two honest agents confidently
 * agreeing on a wrong number. This records whether that risk was actually
 * retired for a given read, or merely not measurable.
 */
export interface Corroboration {
  /** Independent deployments read. 1 means no plurality exists for this subject. */
  sources: number;
  /** Every deployment id consulted, primary first. */
  deploymentIds: string[];
  /** Largest pairwise divergence, in basis points. 0 when single-source. */
  maxDivergenceBps: number;
  /** True only when two or more sources agreed. Never true for a single source. */
  corroborated: boolean;
}

/** Evidence that a Graph read was live, pinned, and fresh. */
export interface Provenance {
  deploymentId: string;
  indexedBlock: number;
  chainHead: number;
  queriedAt: number;
  queryHash: string;
  hasIndexingErrors: boolean;
  /** Absent on reads taken before corroboration existed; see Corroboration. */
  corroboration?: Corroboration;
}

export interface Attestation {
  provenance: Provenance;
  assertion: TypedAssertion;
  /** Hash over provenance + assertion. The tribunal re-checks this. */
  digest: string;
}

/** Why a read could not be trusted. Never collapses into a pass. */
export type UnverifiableReason =
  | "deployment-mismatch"
  | "stale-index"
  | "indexing-errors"
  | "missing-meta"
  | "no-data"
  /** Independent deployments of the same protocol disagreed. The data layer is
   *  contested, so no party can be convicted on it. */
  | "corroboration-divergence";

export class UnverifiableError extends Error {
  constructor(
    readonly reason: UnverifiableReason,
    message: string,
  ) {
    super(message);
    this.name = "UnverifiableError";
  }
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable stringify so the digest doesn't depend on key order. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function digestOf(provenance: Provenance, assertion: TypedAssertion): string {
  return sha256(canonicalize({ provenance, assertion }));
}
