// Sealed-evidence gateway. See docs/design.md §3.2.
//
// The two agents never talk to each other, so their submissions have to reach
// the tribunal by some route that neither controls. Each publishes its own
// sealed submission here; the enclave fetches the pair over Confidential HTTP,
// which keeps the request and response hidden from node operators.
//
// Storage IS now encrypted at rest, which closes the gap this comment used to
// record. The bundle is sealed to the tribunal's public key before it is
// published, so the store can stay a public gist and hold nothing readable. The
// private half lives in the Vault DON and is released only into the attested
// enclave. See packages/shared/src/envelope.ts and design.md §3.5.
import { execFileSync } from "node:child_process";
import { isSealedEnvelope, open, seal } from "@perjury/shared";
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
 *
 * The body is SEALED to `publicKey` before it goes anywhere. A gist URL is not
 * an access control, and the store was the last plaintext in the system: the
 * fetch was confidential and the thing being fetched was not. Passing no key
 * publishes plaintext, which is retained only so an operator can reproduce the
 * old behaviour deliberately rather than by forgetting a flag.
 */
export function publishBundle(bundle: EvidenceBundle, publicKey?: string): string {
  const plaintext = JSON.stringify(bundle, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  const body = publicKey
    ? JSON.stringify(seal(plaintext, publicKey, bundle.claimId), null, 2)
    : plaintext;
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

/**
 * Read a bundle back, for verification outside the enclave.
 *
 * Takes the private key because a sealed store is only useful if the thing
 * holding the key is the only thing that can read it. Without a key this can
 * still read a plaintext publish, and refuses an envelope rather than returning
 * something unusable.
 */
export async function fetchBundle(url: string, privateKey?: string): Promise<EvidenceBundle> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gateway fetch ${res.status}`);
  const body = (await res.json()) as unknown;

  if (isSealedEnvelope(body)) {
    if (!privateKey) throw new Error("bundle is sealed and no private key was supplied");
    return JSON.parse(open(body, privateKey)) as EvidenceBundle;
  }
  return body as EvidenceBundle;
}
