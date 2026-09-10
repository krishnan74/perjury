// Sealed-evidence gateway. See docs/design.md §3.2.
//
// The two agents never talk to each other, so their submissions have to reach
// the tribunal by some route that neither controls. Each publishes its own
// sealed submission here; the enclave fetches the pair over Confidential HTTP,
// which keeps the request and response hidden from node operators.
//
// ⚠ Storage is not yet encrypted at rest. The design (§3.5) is an encrypted blob
// with the key held by the Vault DON, so the store is public and the contents are
// not. Today the transport is confidential and the store is not, which is a real
// gap and is documented as one rather than glossed.
import { execFileSync } from "node:child_process";
import type { SealedSubmission } from "@perjury/tribunal";

export interface EvidenceBundle {
  claimId: string;
  claim: SealedSubmission;
  witness: SealedSubmission;
  /** Panel seats, present only for an appeal. */
  panel?: { member: string; submission: SealedSubmission }[];
  /**
   * The agent VRF actually drew.
   *
   * The witness submission used to be anonymous, so nothing connected the
   * evidence the tribunal read to the agent the chain had assigned. Recording it
   * lets the archive be checked against WitnessAssigned. The tribunal does not
   * yet verify this itself; that would need it to read chain state.
   */
  witnessAgent?: { name: string; address: string };
  /** The claim as drafted. keccak256 of this is what the claimant bonded. */
  claimText?: string;
  claimHash?: string;
}

/**
 * Publish a bundle and return a URL the enclave can fetch.
 *
 * Uses a GitHub gist because it needs no infrastructure and is a real HTTPS
 * endpoint reachable from the enclave — the point is that the tribunal reads the
 * agents' actual work rather than a fixture compiled into its own binary.
 */
export function publishBundle(bundle: EvidenceBundle): string {
  const body = JSON.stringify(bundle, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  const out = execFileSync(
    "gh",
    ["gist", "create", "--filename", `perjury-claim-${bundle.claimId}.json`, "--desc",
     `Perjury sealed evidence, claim ${bundle.claimId}`, "-"],
    { input: body, encoding: "utf8" },
  ).trim();

  const id = out.split("/").pop();
  if (!id) throw new Error(`could not parse gist url: ${out}`);
  // Raw URL, so the enclave gets JSON rather than a rendered page.
  return `https://gist.githubusercontent.com/raw/${id}`;
}

/** Read a bundle back, for verification outside the enclave. */
export async function fetchBundle(url: string): Promise<EvidenceBundle> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gateway fetch ${res.status}`);
  return (await res.json()) as EvidenceBundle;
}
