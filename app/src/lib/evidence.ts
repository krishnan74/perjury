/**
 * The agents' own work, read back from the archive.
 *
 * The chain records that evidence existed — `claimHash` and `evidenceCommitment`
 * are hashes — and nothing about what either agent actually did. Without this
 * file the replay can only show that a verdict happened, never how it was
 * reached, which is the part worth watching.
 *
 * Server-only. It reads from disk, and every value it returns was produced by an
 * agent run rather than by this page. Two of those values can be checked rather
 * than trusted, and are:
 *
 *   - the archived query must hash to the `queryHash` the guard recorded
 *   - the archived claim text must hash to the `claimHash` bonded on chain
 *
 * Where a check fails or an artifact is missing, the reader says so and the
 * component renders the absence. It never fills a gap with something plausible.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalize, sha256 } from "@perjury/shared";
import { keccak256, toBytes } from "viem";

export interface Provenance {
  deploymentId: string;
  indexedBlock: number;
  chainHead: number;
  queriedAt: number;
  queryHash: string;
  hasIndexingErrors: boolean;
  corroboration?: {
    sources: number;
    deploymentIds: string[];
    maxDivergenceBps: number;
    corroborated: boolean;
  };
}

export interface ArchivedSubmission {
  attestation: {
    provenance: Provenance;
    assertion: { metric: string; value: number; unit: string; asOfBlock: number; comparator: string };
  } | null;
  methodology: string;
  evidence: unknown;
  query?: string;
  unverifiableReason?: string;
}

export interface Archive {
  claimId: string;
  claim: ArchivedSubmission;
  witness: ArchivedSubmission;
  panel?: { member: string; submission: ArchivedSubmission }[];
  witnessAgent?: { name: string; address: string };
  claimText?: string;
  claimHash?: string;
  gatewayUrl?: string;
  archivedAt?: string;
}

/**
 * The archive lives at the repo root, beside the contracts and the agents,
 * because it is a record of runs rather than an asset of the site. Next runs
 * with `app/` as cwd, so both are tried.
 */
const ROOTS = [join(process.cwd(), "..", "evidence-archive"), join(process.cwd(), "evidence-archive")];

export function readArchive(claimId: string): Archive | null {
  for (const root of ROOTS) {
    try {
      return JSON.parse(readFileSync(join(root, `${claimId}.json`), "utf8")) as Archive;
    } catch {
      // Try the next root; a genuinely missing archive returns null below and
      // the page says the claim has none.
    }
  }
  return null;
}

/**
 * Does the archived document hash to the hash the guard recorded?
 *
 * Returns null when there is no query to check, which is the case for runs
 * archived before the document was captured. Never returns true by default —
 * an unverifiable query and a verified one must not look the same.
 */
export function queryVerified(s: ArchivedSubmission): boolean | null {
  if (!s.query || !s.attestation) return null;
  return sha256(canonicalize({ q: s.query, v: {} })) === s.attestation.provenance.queryHash;
}

/** Does the archived sentence hash to the claimHash that was bonded on chain? */
export function claimTextVerified(archive: Archive, onChainClaimHash: string): boolean | null {
  if (!archive.claimText) return null;
  return keccak256(toBytes(archive.claimText)).toLowerCase() === onChainClaimHash.toLowerCase();
}

/**
 * The rows the agent's assertion was derived from.
 *
 * Deliberately generic: it finds the first array of entities in the result and
 * lists that entity's scalar fields. The alternative is to teach this file the
 * Messari lending schema, which would quietly break the moment a claim is made
 * about a different subject — and the whole point of the pinned-deployment work
 * is that the subject is not fixed.
 */
export function evidenceRows(s: ArchivedSubmission): { label: string; value: string }[] {
  const ev = s.evidence as Record<string, unknown> | null;
  if (!ev || typeof ev !== "object") return [];

  for (const [key, value] of Object.entries(ev)) {
    if (key === "_meta" || !Array.isArray(value) || value.length === 0) continue;
    const first = value[0] as Record<string, unknown>;
    if (!first || typeof first !== "object") continue;
    return Object.entries(first)
      .filter(([, v]) => v === null || typeof v !== "object")
      .map(([label, v]) => ({ label, value: format(v) }));
  }
  return [];
}

/**
 * Big USD figures arrive as long decimal strings. Rounded for reading, with the
 * full value kept in a title attribute by the component — truncating silently
 * would be a small lie about what the agent actually received.
 */
function format(v: unknown): string {
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n) && Math.abs(n) >= 1000) {
      return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(n);
    }
  }
  return String(v);
}

/**
 * The reasoning, without the bookkeeping prefix.
 *
 * Methodology is stored as "witness: Aave v3 via messari-lending; <reasoning>
 * [1 independent deployment(s), pinned @ N]". The prefix and the bracketed tail
 * are shown as their own fields, so repeating them in the sentence is noise.
 */
export function reasoning(s: ArchivedSubmission): string {
  const after = s.methodology.split(";").slice(1).join(";").trim();
  return (after || s.methodology).replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}
