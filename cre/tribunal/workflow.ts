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
	verdictSinkAddress: z.string(),
	chainSelector: z.string(), // CCIP chain selector; string because JSON has no bigint
})
type Config = z.infer<typeof configSchema>

// ─── Types mirrored from packages/tribunal ──────────────────
// Duplicated rather than imported: the workflow compiles to a standalone WASM
// binary with its own dependency tree. packages/tribunal holds the same logic
// under test (packages/tribunal/test) — keep the two in sync deliberately.
const VERDICT = { None: 0, Match: 1, Mismatch: 2, Unverifiable: 3 } as const

type Assertion = {
	subject: string
	metric: string
	comparator: string
	value: number
	unit: string
	asOfBlock: number
}

type SealedSubmission = {
	assertion: Assertion | null
	provenanceOk: boolean
	queryHash: string
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
	const rows = (evidence as Record<string, unknown>)['lendingProtocols']
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
	// 1. Provenance gate — bad data can never reach a Match.
	if (claim.unverifiableReason || witness.unverifiableReason) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	if (!claim.provenanceOk || !witness.provenanceOk) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	if (!claim.assertion || !witness.assertion) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}

	const a = claim.assertion
	const b = witness.assertion

	// 2. Comparable shape, or there is nothing to compare.
	if (a.subject !== b.subject || a.metric !== b.metric || a.unit !== b.unit) {
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
		claim.queryHash === witness.queryHash ||
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

// ─── TEE handler ────────────────────────────────────────────
// Receives a TeeRuntime. Everything here runs inside the enclave until we
// explicitly cross back with usingTheDons().
export const onAdjudicationTrigger = (runtime: TeeRuntime<Config>): string => {
	const config = runtime.config

	// The salt is released by the Vault DON directly into the attested enclave.
	// It binds the evidence commitment so the published hash cannot be
	// brute-forced back to the sealed evidence.
	const salt = runtime.getSecret({ id: config.secretId }).result().value

	// Sealed submissions for the claim under adjudication. In production these
	// arrive as encrypted-blob pointers on the trigger event; under simulation we
	// exercise the path with a fixture so the confidential round-trip is real.
	const evidenceRequest = {
		claimId: '1',
		claim: {
			assertion: {
				subject: 'aave-v3-eth',
				metric: 'totalBorrowBalanceUSD',
				comparator: 'gt',
				value: 1_000_000,
				unit: 'USD',
				asOfBlock: 1000,
			},
			provenanceOk: true,
			queryHash: 'claimant-query-hash',
			methodology: 'claimant: messari lending schema, latest market snapshot',
			evidence: {
				lendingProtocols: [{ totalBorrowBalanceUSD: '1000000', totalDepositBalanceUSD: '1' }],
			},
		},
		witness: {
			assertion: {
				subject: 'aave-v3-eth',
				metric: 'totalBorrowBalanceUSD',
				comparator: 'gt',
				value: 1_000_400,
				unit: 'USD',
				asOfBlock: 1000,
			},
			provenanceOk: true,
			queryHash: 'witness-query-hash',
			methodology: 'witness: messari lending schema, block-pinned read',
			evidence: {
				lendingProtocols: [{ totalBorrowBalanceUSD: '1000400', totalDepositBalanceUSD: '1' }],
			},
		},
	}

	// Fetch both sealed submissions from INSIDE the enclave. Using the HTTPClient
	// with a TeeRuntime keeps request and response payloads confidential from node
	// operators — this is the load-bearing confidentiality in Perjury.
	// (Do NOT use ConfidentialHTTPClient here; it has no TeeRuntime overload.)
	// SIMULATION NOTE: the staging endpoint echoes the posted body back, which
	// lets us exercise the full confidential request/response path end to end.
	// At T5 this becomes a GET against the sealed-evidence gateway, addressed by
	// the pointers in the trigger event. Both directions are confidential either
	// way — that is the property being demonstrated.
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: config.evidenceGatewayUrl,
			method: 'POST',
			body: hexToBase64(toHex(JSON.stringify(evidenceRequest))),
			multiHeaders: { 'Content-Type': { values: ['application/json'] } },
		})
		.result()

	if (!ok(response)) {
		throw new Error(`Evidence fetch failed with status: ${response.statusCode}`)
	}

	const echoed = JSON.parse(text(response)) as { data?: unknown; json?: unknown }
	const bundle = (echoed.json ?? echoed.data ?? echoed) as {
		claimId: string
		claim: SealedSubmission
		witness: SealedSubmission
	}

	const { verdict, confidence } = adjudicate(bundle.claim, bundle.witness, config.toleranceBps)

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

	const encodedPayload = encodeAbiParameters(
		parseAbiParameters('uint256 claimId, uint8 verdict, bytes32 evidenceCommitment'),
		[BigInt(bundle.claimId), verdict, evidenceCommitment],
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
