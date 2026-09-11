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
  /**
   * Panel seats, present only for an appeal.
   *
   * `member` is the address VRF drew, not a seat label. It used to be "seat-a",
   * "seat-b", "seat-c" — model assignments with no connection to the agents the
   * chain actually seated, so nothing tied a finding to whoever produced it.
   * That is the same gap the witness submission had.
   */
  panel?: { member: string; name?: string; submission: SealedSubmission }[];
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
/** Seal the bundle if a key was given, and render the bytes that get published. */
function bodyOf(bundle: EvidenceBundle, publicKey?: string): string {
  const plaintext = JSON.stringify(bundle, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return publicKey ? JSON.stringify(seal(plaintext, publicKey, bundle.claimId), null, 2) : plaintext;
}

const filenameOf = (claimId: string) => `perjury-claim-${claimId}.json`;
const descriptionOf = (claimId: string) => `Perjury sealed evidence, claim ${claimId}`;
/** Raw URL, so the enclave gets JSON rather than a rendered page. */
const rawUrl = (id: string) => `https://gist.githubusercontent.com/raw/${id}`;

/**
 * Publish over the GitHub API.
 *
 * The CLI version below cannot run anywhere except a developer's machine, which
 * is the single reason a claim could not be submitted from the deployed site.
 * This is the same request the CLI was making.
 *
 * Secret rather than public, matching `gh gist create` without `--public`. That
 * is not the confidentiality boundary — the body is sealed to the tribunal's key
 * and a gist URL was never an access control — but there is no reason to widen
 * it either.
 */
export async function publishBundleViaApi(
  bundle: EvidenceBundle,
  token: string,
  publicKey?: string,
): Promise<string> {
  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      description: descriptionOf(bundle.claimId),
      public: false,
      files: { [filenameOf(bundle.claimId)]: { content: bodyOf(bundle, publicKey) } },
    }),
  });

  if (!res.ok) {
    // The body carries GitHub's reason — a scope that is missing, a token that
    // expired. Losing it here means debugging a 401 with no 401 in front of you.
    throw new Error(`gist create failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const { id } = (await res.json()) as { id?: string };
  if (!id) throw new Error("gist created but the response carried no id");
  return rawUrl(id);
}

/**
 * Publish, by whichever route is available.
 *
 * Prefers the API when a token is present, because that is the only route a
 * server has. Falls back to the CLI so a developer with `gh` already logged in
 * needs no new credential to run the scenes.
 */
export async function publishBundle(
  bundle: EvidenceBundle,
  publicKey?: string,
  token = process.env.GITHUB_GIST_TOKEN,
): Promise<string> {
  if (token) return publishBundleViaApi(bundle, token, publicKey);

  const out = execFileSync(
    "gh",
    ["gist", "create", "--filename", filenameOf(bundle.claimId), "--desc",
     descriptionOf(bundle.claimId), "-"],
    { input: bodyOf(bundle, publicKey), encoding: "utf8" },
  ).trim();

  const id = out.split("/").pop();
  if (!id) throw new Error(`could not parse gist url: ${out}`);
  return rawUrl(id);
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
