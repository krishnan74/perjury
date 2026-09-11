/**
 * Run the agents for real and publish their sealed submissions for the tribunal.
 *
 *   npx tsx agents/runner/publish-evidence.ts draft   <claimId> [honest|false]
 *   npx tsx agents/runner/publish-evidence.ts witness <claimId> <witnessName> <witnessAddr>
 *   npx tsx agents/runner/publish-evidence.ts panel   <claimId>
 *
 * Three phases, because the order matters and used to be wrong.
 *
 * The claimant used to draft AFTER its bond was already posted, and the scenes
 * bonded a hardcoded placeholder hash — the same bytes on every run — so the
 * claim on chain committed to nothing the agent had actually derived. A claimant
 * could bond first and decide what it was claiming afterwards, which is the one
 * freedom this protocol exists to remove.
 *
 * Now `draft` runs first and prints the claim text and its keccak hash. The
 * scene bonds THAT hash, so the money is attached to a specific sentence before
 * anyone knows who will check it. `witness` then runs after VRF has drawn, and
 * records which agent was drawn, so the submission is attributable rather than
 * anonymous. `panel` seats an appeal over the submissions already published,
 * without re-deriving either of them.
 *
 * The claimant and witness still run as separate derivations that never see each
 * other's work; the gateway is the only place the two meet, and they meet inside
 * the enclave.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { keccak256, toBytes } from "viem";
import { draftClaim } from "@perjury/claimant";
import { witness } from "@perjury/witness";
import { runPanel, seatPanel } from "@perjury/panel";
import { publishBundle, type EvidenceBundle } from "@perjury/gateway";
import { ClaudeCodeClient } from "@perjury/llm";
import type { SealedSubmission } from "@perjury/tribunal";

const phase = process.argv[2];
const claimId = process.argv[3] ?? "1";
const llm = new ClaudeCodeClient();

/** Between phases. Gitignored: the committed artifact is the archive. */
const STAGING = ".evidence";
const stagingPath = `${STAGING}/${claimId}.draft.json`;
const witnessPath = `${STAGING}/${claimId}.witness.json`;

const seal = (
  a: {
    attestation: unknown;
    methodology: string;
    evidence: unknown;
    unverifiableReason?: string;
    query?: string;
  },
): SealedSubmission => ({
  attestation: a.attestation as never,
  methodology: a.methodology,
  evidence: a.evidence,
  unverifiableReason: a.unverifiableReason,
  query: a.query,
});

if (phase === "draft") {
  const honest = process.argv[4] !== "false";

  // Any pinned deployment works and none of them need a code change, which is
  // what a standardized query pattern buys. Defaults to the subject the recorded
  // scenes use so passing nothing reproduces them.
  const subject = process.argv[5] ?? "aave-v3-ethereum";

  const claim = await draftClaim(
    subject,
    "utilization ratio (total borrowed / total deposited)",
    honest ? { mode: "honest" } : { mode: "false", overstateBy: 0.6 },
    llm,
  );

  // The hash the scene will bond. Binding it to the text is the whole point of
  // this phase: the claim becomes expensive to change once the bond is posted.
  const claimHash = keccak256(toBytes(claim.text));

  mkdirSync(STAGING, { recursive: true });
  writeFileSync(
    stagingPath,
    `${JSON.stringify(
      {
        claimId,
        text: claim.text,
        claimHash,
        honest,
        atBlock: claim.assertion.asOfBlock || undefined,
        subject: claim.subject,
        metric: claim.assertion.metric,
        unit: claim.assertion.unit,
        comparator: claim.assertion.comparator,
        submission: seal(claim),
      },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    )}\n`,
  );

  console.log(`\nCLAIMANT ${honest ? "(honest)" : "(lying)"}: "${claim.text}"`);
  console.log(`  asserts ${claim.assertion.value}%`);
  console.log(`CLAIM_TEXT ${claim.text}`);
  console.log(`CLAIM_HASH ${claimHash}`);
} else if (phase === "witness" || phase === "panel") {
  const witnessName = process.argv[4] ?? "unknown";
  const witnessAddr = process.argv[5] ?? "";
  const withPanel = phase === "panel";

  const draft = JSON.parse(readFileSync(stagingPath, "utf8")) as {
    text: string;
    claimHash: string;
    subject: string;
    metric: string;
    unit: string;
    comparator: string;
    atBlock?: number;
    submission: SealedSubmission;
  };

  const asClaim = {
    claimId,
    subject: draft.subject,
    text: draft.text,
    metric: draft.metric,
    unit: draft.unit,
    comparator: draft.comparator as never,
    // Witness and panel read the block the claimant read, not whatever is latest
    // when they happen to run — a panel seated minutes later would otherwise be
    // comparing against different chain state.
    atBlock: draft.atBlock,
  };

  /*
   * The witness derives ONCE.
   *
   * The panel phase used to re-run it, which meant an appeal overwrote the
   * archive with a second read taken minutes later — so the record showed the
   * witness reading after the panel had already been seated, which is not what
   * happened and not what the first verdict was based on. The panel reviews the
   * same submission the tribunal originally read.
   */
  let witnessSealed: SealedSubmission;
  let drawn = { name: witnessName, address: witnessAddr };
  if (phase === "witness") {
    const w = await witness(asClaim, llm);
    console.log(`WITNESS: derives ${w.attestation?.assertion.value ?? w.unverifiableReason}%`);
    witnessSealed = seal(w);
    writeFileSync(
      witnessPath,
      `${JSON.stringify({ submission: witnessSealed, drawn }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`,
    );
  } else {
    const staged = JSON.parse(readFileSync(witnessPath, "utf8")) as {
      submission: SealedSubmission;
      drawn: { name: string; address: string };
    };
    witnessSealed = staged.submission;
    drawn = staged.drawn;
    console.log(`WITNESS: reusing the submission the tribunal already read (${drawn.name})`);
  }

  const bundle: EvidenceBundle = {
    claimId,
    claim: draft.submission,
    witness: witnessSealed,
    // Who the chain drew. The submission used to be anonymous, so nothing
    // connected the evidence the tribunal read to the agent VRF had actually
    // assigned; the archive can now be checked against WitnessAssigned.
    witnessAgent: drawn,
    claimText: draft.text,
    claimHash: draft.claimHash,
  };

  if (withPanel) {
    /*
     * Seat the agents the chain drew, not three placeholder labels.
     *
     * This used to pass ["seat-a", "seat-b", "seat-c"], which are model
     * assignments and had no connection to the addresses VRF seated — so a
     * finding could not be attributed to whoever produced it, and the replay
     * could not honestly show a panel voting. Same gap the witness submission
     * had. Passed as name=address pairs so the archive keeps both.
     */
    const seated = (process.argv[4] ?? "").split(",").filter(Boolean);
    if (seated.length === 0) throw new Error("panel phase needs the drawn seats: name=0xaddr,name=0xaddr,…");

    const members = seated.map((s) => s.split("=")[1] ?? s);
    const names = new Map(seated.map((s) => [s.split("=")[1] ?? s, s.split("=")[0] ?? ""]));

    const findings = await runPanel(asClaim, seatPanel(members));
    bundle.panel = findings.map((f) => ({
      member: f.member,
      name: names.get(f.member),
      submission: f.submission,
    }));
    console.log("PANEL:");
    for (const f of findings) {
      console.log(`  ${names.get(f.member) ?? f.member} → ${f.submission.attestation?.assertion.value ?? f.submission.unverifiableReason}`);
    }
  }

  /*
   * Seal before publishing.
   *
   * The gateway is a public gist, and a URL is not an access control. Sealing
   * the bundle to the tribunal's public key means the store holds ciphertext and
   * the enclave is the only thing that can read it — which is what design.md
   * §3.5 always specified and what the site copy had been claiming.
   *
   * Publishing plaintext still works when no public key is set, so the fallback
   * is a deliberate choice rather than a forgotten flag, and the workflow
   * refuses plaintext once it is configured for envelopes.
   */
  const envelopeKey = process.env.PERJURY_ENVELOPE_PUBKEY;
  if (!envelopeKey) {
    console.warn("PERJURY_ENVELOPE_PUBKEY unset — publishing PLAINTEXT evidence to the gateway");
  }
  const url = publishBundle(bundle, envelopeKey);
  console.log(`\ngateway: ${url}${envelopeKey ? "  (sealed)" : "  (plaintext)"}`);

  /*
   * Keep the agents' work.
   *
   * Until now nothing about a run survived it. The gateway gets a fresh gist per
   * run and only the newest URL is kept, in the CRE config; the chain keeps a
   * commitment, which is a hash. So a settled verdict could be proven to exist
   * and never inspected, which is a poor bargain for a project whose subject is
   * verifiable claims.
   *
   * This is a deliberate disclosure and is recorded as one in docs/decisions.md.
   * Note what it does NOT change: the tribunal still publishes a verdict and a
   * commitment and nothing else. The bundle is published here, by the runner,
   * out of band, after the fact. Confidentiality is a property of the
   * adjudication window — it stops node operators reading evidence in flight and
   * stops a claimant tailoring to a witness's method before the verdict lands —
   * and it was never eternal. The gateway gist has been world-readable from the
   * first run.
   */
  // Filed under the registry that issued the claim. Claim ids restart at one with
  // every cascade, so a flat directory silently overwrote a settled claim's
  // evidence with a new claim that happened to reuse its number.
  const dir = `evidence-archive/${(process.env.CLAIM_REGISTRY_ADDRESS ?? "unknown").toLowerCase()}`;
  mkdirSync(dir, { recursive: true });
  const archive = `${dir}/${claimId}.json`;
  writeFileSync(
    archive,
    `${JSON.stringify({ ...bundle, gatewayUrl: url, archivedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`archived: ${archive}`);

  /*
   * Tell the gateway where this claim's evidence went.
   *
   * The workflow used to be edited here — its config carried the gist URL and
   * the claim id, and this rewrote both after every publish. That only worked
   * because a human redeployed the workflow between scenes. Now the workflow
   * reads the claim off chain and asks the site for `/api/evidence/<claimId>`,
   * so nothing about it changes per run and the only thing that has to be
   * recorded is which store holds which claim.
   */
  const indexPath = `${dir}/gateway-index.json`;
  const index: Record<string, string> = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, "utf8"))
    : {};
  index[claimId] = url;
  const ordered = Object.fromEntries(
    Object.keys(index)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => [k, index[k]]),
  );
  writeFileSync(indexPath, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`gateway index updated — the tribunal will fetch claim ${claimId} from the site`);
} else {
  console.error("usage: publish-evidence.ts draft   <claimId> [honest|false]");
  console.error("       publish-evidence.ts witness <claimId> <witnessName> <witnessAddr>");
  console.error("       publish-evidence.ts panel   <claimId> <name=0xaddr,name=0xaddr,…>");
  process.exit(1);
}
