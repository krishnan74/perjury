/**
 * One claim, as a sequence of short steps.
 *
 * The previous version spawned the runner and streamed its output for four
 * minutes. That cannot work on a serverless host, and the reason is worth
 * stating because it is not really a platform limitation: a claim is about
 * twenty seconds of work and three and a half minutes of waiting. The waiting is
 * the random draw and the challenge window, and neither needs a process sitting
 * on it. Splitting the run into steps the browser drives removes the long
 * function and, incidentally, removes the failure mode where a four-minute
 * request dies at minute three and leaves a claim half-posted.
 *
 * The agents run in this process rather than as spawned commands, so the
 * repository does not need to be on disk.
 *
 * What this deliberately does not do is adjudicate. The tribunal is the
 * confidential workflow, and nothing here can stand in for it: `VerdictSink`
 * accepts reports from Chainlink Forwarders only. So the verdict step watches
 * the chain rather than producing anything.
 */
import { keccak256, toBytes, toHex } from "viem";
import { draftClaim } from "@perjury/claimant";
import { witness as deriveWitness } from "@perjury/witness";
import { publishBundle, type EvidenceBundle } from "@perjury/gateway";
import { recordGatewayUrl } from "../gateway-index";
import { getJson, setJson } from "./store";
import { REGISTRY, STATUS, SUBMIT_VALUE, VERDICT, WRITE_ABI, pub, walletFor } from "./chain";

/** The metric every scene asserts. Held constant so two agents answer the same question. */
const METRIC = "utilization ratio (total borrowed / total deposited)";

export type Phase = "drafted" | "submitted" | "assigned" | "sealed" | "adjudicated" | "settled";

export interface RunState {
  runId: string;
  phase: Phase;
  subject: string;
  claimant: string;
  /** The sentence that was hashed and bonded. */
  text: string;
  claimHash: `0x${string}`;
  claimedValue: number | null;
  atBlock?: number;
  metric: string;
  unit: string;
  comparator: string;
  /** The claimant's sealed submission, held until the witness has produced one too. */
  claimSubmission: unknown;
  claimQuery?: string;
  claimId?: string;
  submitTx?: `0x${string}`;
  witnessAgent?: { name: string; address: string };
  witnessValue?: number | null;
  gatewayUrl?: string;
  verdict?: string;
  finalizeTx?: `0x${string}`;
  startedAt: number;
}

const key = (runId: string) => `run:${runId}`;
export const loadRun = (runId: string) => getJson<RunState>(key(runId));
const save = (s: RunState) => setJson(key(s.runId), s);

/** What actually leaves an agent: a conclusion, its method, and the rows behind it. */
const seal = (a: {
  attestation: unknown;
  methodology: string;
  evidence: unknown;
  unverifiableReason?: string;
  query?: string;
}) => ({
  attestation: a.attestation,
  methodology: a.methodology,
  evidence: a.evidence,
  unverifiableReason: a.unverifiableReason,
  query: a.query,
});

/**
 * Step 1 — read the indexer and decide what to stake on.
 *
 * Nothing is bonded yet, and that ordering is the point: the agent commits to a
 * sentence before it commits money, so the claim cannot be adjusted afterwards
 * to match whatever the witness happens to find.
 */
export async function draft(subject: string, claimant: string): Promise<RunState> {
  const claim = await draftClaim(subject, METRIC, { mode: "honest" });
  const text = claim.text;

  const state: RunState = {
    runId: crypto.randomUUID(),
    phase: "drafted",
    subject,
    claimant,
    text,
    claimHash: keccak256(toBytes(text)),
    claimedValue: claim.assertion?.value ?? null,
    atBlock: claim.assertion?.asOfBlock || undefined,
    metric: claim.assertion.metric,
    unit: claim.assertion.unit,
    comparator: claim.assertion.comparator,
    claimSubmission: seal(claim),
    claimQuery: claim.query,
    startedAt: Date.now(),
  };
  await save(state);
  return state;
}

/**
 * Step 2 — bond it.
 *
 * Only the hash of the sentence goes on chain. The sentence itself travels with
 * the sealed evidence, so the claim is fixed without being published.
 */
export async function submit(runId: string): Promise<RunState> {
  const state = await loadRun(runId);
  if (!state) throw new Error("unknown run");
  if (state.phase !== "drafted") return state;

  const wallet = walletFor(state.claimant);
  if (!wallet) throw new Error(`no key configured for ${state.claimant}`);

  const claimId = await pub.readContract({
    address: REGISTRY, abi: WRITE_ABI, functionName: "nextClaimId",
  });

  const hash = await wallet.client.writeContract({
    address: REGISTRY, abi: WRITE_ABI, functionName: "submitClaim",
    args: [keccak256(toBytes(`${state.subject}:utilization`)), state.claimHash],
    value: SUBMIT_VALUE,
  });
  await pub.waitForTransactionReceipt({ hash });

  state.claimId = claimId.toString();
  state.submitTx = hash;
  state.phase = "submitted";
  await save(state);
  return state;
}

/**
 * Step 3 — has the draw fulfilled?
 *
 * Returns rather than waits. The browser polls, because a request that sits on a
 * VRF round is a request that can time out for a reason the reader cannot see.
 */
export async function assignment(runId: string): Promise<RunState> {
  const state = await loadRun(runId);
  if (!state?.claimId) throw new Error("unknown run");
  if (state.phase !== "submitted") return state;

  const claim = await pub.readContract({
    address: REGISTRY, abi: WRITE_ABI, functionName: "claimOf", args: [BigInt(state.claimId)],
  });
  if (claim.witness === "0x0000000000000000000000000000000000000000") return state;

  state.witnessAgent = { name: "", address: claim.witness };
  state.phase = "assigned";
  await save(state);
  return state;
}

/**
 * Step 4 — the drawn witness reads the same block, on its own, and both
 * submissions are sealed and published together.
 *
 * The bundle is the only place the two ever meet, and it meets as ciphertext.
 * Neither agent sees the other's work, and neither does this server after the
 * envelope is closed.
 */
export async function runWitness(runId: string): Promise<RunState> {
  const state = await loadRun(runId);
  if (!state?.claimId) throw new Error("unknown run");
  if (state.phase !== "assigned") return state;

  const finding = await deriveWitness({
    claimId: state.claimId,
    subject: state.subject,
    text: state.text,
    metric: state.metric,
    unit: state.unit,
    comparator: state.comparator as never,
    // The block the claimant read, not whatever is latest now. Without this,
    // state that legitimately moved between the two reads looks like
    // disagreement.
    atBlock: state.atBlock,
  });

  const bundle: EvidenceBundle = {
    claimId: state.claimId,
    claim: state.claimSubmission as EvidenceBundle["claim"],
    witness: seal(finding) as EvidenceBundle["witness"],
    witnessAgent: state.witnessAgent,
    claimText: state.text,
    claimHash: state.claimHash,
  };

  const url = await publishBundle(bundle, process.env.PERJURY_ENVELOPE_PUBKEY);
  await recordGatewayUrl(state.claimId, url);

  state.witnessValue = finding.attestation?.assertion.value ?? null;
  state.gatewayUrl = url;
  state.phase = "sealed";
  await save(state);
  return state;
}

/**
 * Step 5 — watch for a verdict.
 *
 * Nothing here produces one. The tribunal is the confidential workflow, and the
 * sink accepts reports from Chainlink Forwarders alone, so this reads the claim
 * and reports what it finds. If no verdict ever lands, that is visible rather
 * than papered over.
 */
export async function verdict(runId: string): Promise<RunState> {
  const state = await loadRun(runId);
  if (!state?.claimId) throw new Error("unknown run");

  const claim = await pub.readContract({
    address: REGISTRY, abi: WRITE_ABI, functionName: "claimOf", args: [BigInt(state.claimId)],
  });
  if (Number(claim.verdict) === 0) return state;

  state.verdict = VERDICT[Number(claim.verdict)];
  state.phase = STATUS[Number(claim.status)] === "Settled" ? "settled" : "adjudicated";
  await save(state);
  return state;
}

/**
 * Step 6 — settle, once the challenge window has closed.
 *
 * Permissionless on purpose: anyone may call it, so settlement does not depend
 * on the party who would rather it did not happen.
 */
export async function finalize(runId: string): Promise<RunState> {
  const state = await loadRun(runId);
  if (!state?.claimId) throw new Error("unknown run");
  if (state.phase === "settled") return state;

  const wallet = walletFor(state.claimant) ?? walletFor("operator");
  if (!wallet) throw new Error("no key configured to finalize with");

  const hash = await wallet.client.writeContract({
    address: REGISTRY, abi: WRITE_ABI, functionName: "finalize", args: [BigInt(state.claimId)],
  });
  await pub.waitForTransactionReceipt({ hash });

  state.finalizeTx = hash;
  state.phase = "settled";
  await save(state);
  return state;
}

/** Present so a subject string from a browser never reaches a contract unchecked. */
export const subjectTopic = (subject: string) => toHex(`${subject}:utilization`);
