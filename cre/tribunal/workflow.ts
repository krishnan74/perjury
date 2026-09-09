import {
	cre,
	hexToBase64,
	ok,
	text,
	type TeeRuntime,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem'
import { z } from 'zod'

// ─── Config ─────────────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),
	evidenceGatewayUrl: z.string(),
	secretId: z.string(),
	toleranceBps: z.number(),
	/** 'verdict' for an initial adjudication, 'panel' for an appeal. */
	reportKind: z.enum(['verdict', 'panel']).default('verdict'),
	/** Claim under adjudication. */
	claimId: z.string().default('1'),

	verdictSinkAddress: z.string(),
	chainSelector: z.string(), // CCIP chain selector; string because JSON has no bigint
})
type Config = z.infer<typeof configSchema>

// ─── Types mirrored from packages/tribunal ──────────────────
// Duplicated rather than imported: the workflow compiles to a standalone WASM
// binary with its own dependency tree. packages/tribunal holds the same logic
// under test (packages/tribunal/test) — keep the two in sync deliberately.
const VERDICT = { None: 0, Match: 1, Mismatch: 2, Unverifiable: 3 } as const

/** How far apart two readings may be in time before they are not comparable. */
const MAX_SKEW_SECONDS = 300
/** Nominal block times. Mirrors BLOCK_SECONDS in packages/tribunal. */
const BLOCK_SECONDS: Record<string, number> = {
	ethereum: 12,
	polygon: 2,
	arbitrum: 0.25,
	optimism: 2,
	gnosis: 5,
	base: 2,
}
const maxBlockSkewFor = (chain: string): number =>
	Math.ceil(MAX_SKEW_SECONDS / (BLOCK_SECONDS[chain] ?? 12))

type Assertion = {
	subject: string
	/** Chain the reading came from — block skew is judged in time, not blocks. */
	chain: string
	metric: string
	comparator: string
	value: number
	unit: string
	asOfBlock: number
}

/** Matches what the agents actually publish — see packages/tribunal. */
type Attestation = {
	provenance: { deploymentId: string; indexedBlock: number; chainHead: number; queryHash: string }
	assertion: Assertion
	digest: string
}

type SealedSubmission = {
	attestation: Attestation | null
	methodology: string
	/** Raw query result. The tribunal recomputes from this rather than trusting
	 *  the stated assertion — the witness earns only on Mismatch and so is the
	 *  party with a motive to misreport (ADR 0007). */
	evidence?: unknown
	unverifiableReason?: string
}

/** Recompute a metric from raw evidence, ignoring the stated conclusion. */
const recompute = (evidence: unknown, metric: string): number | null => {
	if (evidence === null || typeof evidence !== 'object') return null
	// Entity differs per standardized schema family; the recomputation does not.
	const payload = evidence as Record<string, unknown>
	const rows = payload['lendingProtocols'] ?? payload['dexAmmProtocols']
	if (!Array.isArray(rows) || rows.length === 0) return null
	const row = rows[0] as Record<string, string>
	const num = (k: string): number | null => {
		const v = row[k]
		if (v === undefined) return null
		const n = Number(v)
		return Number.isFinite(n) ? n : null
	}
	if (/utilization/i.test(metric)) {
		const b = num('totalBorrowBalanceUSD')
		const d = num('totalDepositBalanceUSD')
		if (b === null || d === null || d === 0) return null
		return (b / d) * 100
	}
	if (/turnover/i.test(metric)) {
		const v = num('cumulativeVolumeUSD')
		const t = num('totalValueLockedUSD')
		if (v === null || t === null || t === 0) return null
		return v / t
	}
	return num(metric)
}

// ─── Adjudication ───────────────────────────────────────────
// NOTE ON CONFIDENTIALITY: this logic is part of the workflow binary the
// Workflow DON hands to the enclave, so the RULE IS PUBLIC — and that is the
// design intent. What the enclave keeps confidential is the DATA it computes
// over: the evidence payloads fetched over Confidential HTTP, the Vault DON
// salt, and every intermediate value. A public rule over sealed evidence is
// exactly what a tribunal should be. See docs/design.md §3.4.
//
// Must stay deterministic for a given input: the enclave result is attested and
// verified by DON consensus.
const withinTolerance = (a: number, b: number, bps: number): boolean => {
	if (a === b) return true
	const scale = Math.max(Math.abs(a), Math.abs(b))
	if (scale === 0) return true
	return (Math.abs(a - b) / scale) * 10_000 <= bps
}

const adjudicate = (
	claim: SealedSubmission,
	witness: SealedSubmission,
	toleranceBps: number,
): { verdict: number; confidence: 'high' | 'low' } => {
	// 1. Provenance gate — bad data can never reach a Match. A submission without
	//    an attestation did not pass the guard, whatever it claims.
	if (claim.unverifiableReason || witness.unverifiableReason) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	if (!claim.attestation || !witness.attestation) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}

	const a = claim.attestation.assertion
	const b = witness.attestation.assertion

	// 2. Comparable shape, or there is nothing to compare.
	if (a.subject !== b.subject || a.metric !== b.metric || a.unit !== b.unit) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}

	// 2a. Readings too far apart are not comparable — two honest parties reading
	//     different blocks have not disagreed about anything. Judged in TIME:
	//     25 blocks is five minutes on Ethereum and six seconds on Arbitrum, and
	//     a flat block count made honest L2 readings Unverifiable.
	if (a.chain !== b.chain) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	if (Math.abs(a.asOfBlock - b.asOfBlock) > maxBlockSkewFor(a.chain)) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}

	// 2b. Recompute both values from raw evidence and judge on those. A party
	//     whose own evidence does not reproduce its stated value has not
	//     submitted evidence.
	const claimValue = recompute(claim.evidence, a.metric)
	const witnessValue = recompute(witness.evidence, b.metric)
	if (claimValue === null || witnessValue === null) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	// Asymmetric by design. A claimant whose evidence does not reproduce its
	// stated value has misrepresented — that is a Mismatch. A witness in the same
	// position has simply not performed a check, and an unreliable check must not
	// convict the claimant.
	if (!withinTolerance(claimValue, a.value, toleranceBps)) {
		return { verdict: VERDICT.Mismatch, confidence: 'high' }
	}
	if (!withinTolerance(witnessValue, b.value, toleranceBps)) {
		return { verdict: VERDICT.Unverifiable, confidence: 'low' }
	}

	// 3. Degeneracy — downgrades confidence, never flips the verdict.
	const derivative =
		claim.attestation.provenance.queryHash === witness.attestation.provenance.queryHash ||
		(claim.methodology.length > 0 && claim.methodology === witness.methodology)

	// 4. Consensus.
	// Judge on the recomputed values, not the stated ones.
	const agrees =
		a.comparator === b.comparator && withinTolerance(claimValue, witnessValue, toleranceBps)

	return {
		verdict: agrees ? VERDICT.Match : VERDICT.Mismatch,
		confidence: derivative ? 'low' : 'high',
	}
}

/**
 * Adjudicate an appeal: judge each seat against the claim independently and take
 * the majority of those that reached a conclusion. Seats that could not read the
 * data are excluded rather than counted as dissent, and a tie overturns nothing.
 */
const adjudicatePanel = (
	claim: SealedSubmission,
	panel: { member: string; submission: SealedSubmission }[],
	toleranceBps: number,
): { verdict: number; confidence: 'high' | 'low' } => {
	let match = 0
	let mismatch = 0
	for (const seat of panel) {
		const r = adjudicate(claim, seat.submission, toleranceBps)
		if (r.verdict === VERDICT.Match) match++
		else if (r.verdict === VERDICT.Mismatch) mismatch++
	}
	const conclusive = match + mismatch
	if (conclusive === 0 || conclusive <= panel.length / 2 || match === mismatch) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	return { verdict: match > mismatch ? VERDICT.Match : VERDICT.Mismatch, confidence: 'high' }
}

// ─── TEE handler ────────────────────────────────────────────
// Receives a TeeRuntime. Everything here runs inside the enclave until we
// explicitly cross back with usingTheDons().
export const onAdjudicationTrigger = (runtime: TeeRuntime<Config>): string => {
	const config = runtime.config

	// The salt is released by the Vault DON directly into the attested enclave.
	// It binds the evidence commitment so the published hash cannot be
	// brute-forced back to the sealed evidence.
	const salt = runtime.getSecret({ id: config.secretId }).result().value

	// Fetch the two agents' sealed submissions from the evidence gateway.
	//
	// This is the load-bearing confidentiality: the request and the response both
	// stay inside the enclave, so node operators never see either party's raw
	// evidence or methodology. The agents publish independently and never see each
	// other's work — the bundle is the only place the two meet, and it meets
	// inside the TEE.
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, { url: config.evidenceGatewayUrl, method: 'GET' })
		.result()

	if (!ok(response)) {
		throw new Error(`Evidence fetch failed with status: ${response.statusCode}`)
	}

	const bundle = JSON.parse(text(response)) as {
		claimId: string
		claim: SealedSubmission
		witness: SealedSubmission
		panel?: { member: string; submission: SealedSubmission }[]
	}

	// On an appeal the panel's majority decides, not the original witness.
	const { verdict, confidence } =
		config.reportKind === 'panel' && bundle.panel && bundle.panel.length > 0
			? adjudicatePanel(bundle.claim, bundle.panel, config.toleranceBps)
			: adjudicate(bundle.claim, bundle.witness, config.toleranceBps)

	// Commitment over both sealed submissions plus the enclave-held salt. Lets
	// anyone later verify the tribunal judged THESE exact inputs, if a party
	// chooses to reveal them — without the protocol ever publishing them.
	const evidenceCommitment = keccak256(
		toHex(JSON.stringify({ claim: bundle.claim, witness: bundle.witness, salt })),
	)

	// ⚠️ Simulation only — remove before deploying. Enclave logs do not leave the
	// TEE in real execution, but do not rely on that: never log evidence.
	runtime.log(`Adjudication complete. verdict=${verdict} confidence=${confidence}`)

	// ── Cross back to the DON ──
	// Anything passed to a capability call on donRuntime executes on Workflow DON
	// nodes and is NO LONGER confidential. We cross over the verdict, the
	// confidence bucket, and a hash — never evidence, methodology, or values.
	const donRuntime = runtime.usingTheDons()

	// A Forwarder only ever calls onReport, so the report kind travels in the
	// payload rather than in the choice of entry point.
	const kind = config.reportKind === 'panel' ? 1 : 0
	const encodedPayload = encodeAbiParameters(
		parseAbiParameters('uint8 kind, uint256 claimId, uint8 verdict, bytes32 evidenceCommitment'),
		[kind, BigInt(bundle.claimId), verdict, evidenceCommitment],
	)

	const report = donRuntime
		.report({
			encodedPayload: hexToBase64(encodedPayload),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	// Deliver the signed report on-chain. The receiving contract sees a specific
	// msg.sender, and VerdictSink.CRE_REPORT_WRITER is immutable — so that address
	// is measured from a real transaction, never guessed.
	const evmClient = new cre.capabilities.EVMClient(BigInt(config.chainSelector))
	evmClient
		.writeReport(donRuntime, {
			receiver: config.verdictSinkAddress,
			report,
		})
		.result()

	return `verdict=${verdict} confidence=${confidence}`
}

// ─── Workflow init ──────────────────────────────────────────
export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		cre.handlerInTee(cronTrigger.trigger({ schedule: config.schedule }), onAdjudicationTrigger, [
			{ tee: 'nitro', regions: ['us-west-2'] },
		]),
	]
}
