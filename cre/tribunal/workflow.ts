import {
	cre,
	encodeCallMsg,
	hexToBase64,
	ok,
	text,
	type TeeRuntime,
} from '@chainlink/cre-sdk'
import {
	bytesToHex,
	decodeAbiParameters,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	keccak256,
	parseAbiParameters,
	toBytes,
	toHex,
	zeroAddress,
	type Address,
} from 'viem'
import { z } from 'zod'
import { isSealedEnvelope, open as openEnvelope } from './envelope'

// ─── Config ─────────────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),
	/**
	 * Where a claim's sealed evidence lives. The claim id is appended, so one
	 * deployed workflow can reach evidence that did not exist when it was built.
	 *
	 * This used to be a single fixed URL, which was only workable because the
	 * claim was fixed too. A workflow that finds its own work cannot be told a
	 * new URL, so the address has to be derivable from the claim id alone.
	 */
	evidenceGatewayBaseUrl: z.string(),
	/** ClaimRegistry. Read once per tick to find what still needs adjudicating. */
	claimRegistryAddress: z.string(),
	secretId: z.string(),
	/**
	 * Vault DON namespace the secrets live in.
	 *
	 * `cre secrets create` files them under `main`, and getSecret defaults to
	 * `default` — so omitting this fails at run time with a quorum error that
	 * reads like a DON outage rather than a name mismatch. The simulator never
	 * catches it, because it reads the values from a local env file instead.
	 */
	secretNamespace: z.string().default('main'),
	/**
	 * Vault DON secret holding the private half of the evidence envelope key.
	 *
	 * Optional so a plaintext gateway still works during a migration, but once
	 * set the enclave becomes the only party that can read the evidence at all.
	 * The public half is generated alongside it and lives in the agents' config;
	 * publishing it is safe and necessary.
	 */
	envelopeSecretId: z.string().optional(),
	toleranceBps: z.number(),
	/**
	 * Deployment ids the tribunal will accept evidence from.
	 *
	 * Provenance was previously enforced only agent-side, which meant a party
	 * asserted the adequacy of its own evidence and the enclave took its word.
	 * Re-checking here is defence in depth, and it has to happen HERE rather
	 * than on-chain: the provenance a party submits includes its queryHash,
	 * which is a fingerprint of its methodology, and publishing that is exactly
	 * what this design refuses to do.
	 *
	 * Generated from packages/shared/pinned-deployments.json by
	 * scripts/deploy-all.ts, so the list cannot drift from what the agents read.
	 */
	pinnedDeployments: z.array(z.string()).default([]),
	/** Seconds of index lag tolerated, converted per chain. Mirrors graph-client. */
	freshnessSeconds: z.number().default(600),
	/**
	 * Pin the workflow to one claim, ignoring what the registry says is pending.
	 *
	 * Kept only for reproducing a past run against a known claim. In normal
	 * operation both of these are absent and both facts come from chain, which
	 * is what makes a claim submitted a minute ago adjudicable at all. Setting
	 * the claim without the kind is a mistake worth failing on rather than
	 * guessing: judging an appeal by the witness rule reaches a real verdict
	 * from the wrong evidence.
	 */
	pinnedClaimId: z.string().optional(),
	pinnedReportKind: z.enum(['verdict', 'panel']).optional(),

	verdictSinkAddress: z.string(),
	chainSelector: z.string(), // CCIP chain selector; string because JSON has no bigint
})
type Config = z.infer<typeof configSchema>

/**
 * The one thing this workflow reads from chain.
 *
 * Deliberately not the whole registry ABI: the workflow has no business calling
 * anything else, and a narrow binding says so better than a comment.
 */
const PENDING_ABI = [
	{
		type: 'function',
		name: 'pendingForTribunal',
		stateMutability: 'view',
		inputs: [],
		outputs: [
			{ name: 'claimId', type: 'uint256' },
			{ name: 'kind', type: 'uint8' },
		],
	},
	{
		type: 'function',
		name: 'claimOf',
		stateMutability: 'view',
		inputs: [{ name: 'claimId', type: 'uint256' }],
		outputs: [
			{
				type: 'tuple',
				components: [
					{ name: 'claimant', type: 'address' },
					{ name: 'witness', type: 'address' },
					{ name: 'subject', type: 'bytes32' },
					{ name: 'claimHash', type: 'bytes32' },
					{ name: 'evidenceCommitment', type: 'bytes32' },
					{ name: 'bond', type: 'uint256' },
					{ name: 'submittedAt', type: 'uint64' },
					{ name: 'assignedAt', type: 'uint64' },
					{ name: 'status', type: 'uint8' },
					{ name: 'verdict', type: 'uint8' },
				],
			},
		],
	},
] as const

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
	provenance: {
		deploymentId: string
		indexedBlock: number
		chainHead: number
		queryHash: string
		hasIndexingErrors?: boolean
	}
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

/**
 * Re-validate a party's provenance rather than trusting it.
 *
 * Every value here was fixed at read time and travels with the submission, so
 * this is pure arithmetic on sealed input — no live lookups, and therefore
 * deterministic, which DON consensus over the enclave result requires.
 */
const provenanceOk = (
	att: Attestation,
	pinnedDeployments: string[],
	freshnessSeconds: number,
): boolean => {
	const p = att.provenance
	// An allowlist of one is still an allowlist; an EMPTY list means no policy was
	// supplied, and a tribunal with no policy must not silently accept everything.
	if (pinnedDeployments.length === 0) return false
	if (!pinnedDeployments.includes(p.deploymentId)) return false
	if (p.hasIndexingErrors) return false
	const allowedLag = Math.ceil(freshnessSeconds / (BLOCK_SECONDS[att.assertion.chain] ?? 12))
	// Negative lag means the index reports ahead of the head we recorded; that is
	// a disagreement about the tip, not staleness.
	if (p.chainHead - p.indexedBlock > allowedLag) return false
	// The assertion must describe the block the data actually came from.
	if (att.assertion.asOfBlock !== p.indexedBlock) return false
	return true
}

const adjudicate = (
	claim: SealedSubmission,
	witness: SealedSubmission,
	toleranceBps: number,
	pinnedDeployments: string[],
	freshnessSeconds: number,
): { verdict: number; confidence: 'high' | 'low' } => {
	// 1. Provenance gate — bad data can never reach a Match. A submission without
	//    an attestation did not pass the guard, whatever it claims.
	if (claim.unverifiableReason || witness.unverifiableReason) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}
	if (!claim.attestation || !witness.attestation) {
		return { verdict: VERDICT.Unverifiable, confidence: 'high' }
	}

	// 1a. Provenance re-checked HERE, not taken on the agents' word. Previously
	//     the enclave verified only that an attestation existed, so a party could
	//     assert the adequacy of its own evidence.
	if (
		!provenanceOk(claim.attestation, pinnedDeployments, freshnessSeconds) ||
		!provenanceOk(witness.attestation, pinnedDeployments, freshnessSeconds)
	) {
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
	pinnedDeployments: string[],
	freshnessSeconds: number,
): { verdict: number; confidence: 'high' | 'low' } => {
	let match = 0
	let mismatch = 0
	for (const seat of panel) {
		const r = adjudicate(claim, seat.submission, toleranceBps, pinnedDeployments, freshnessSeconds)
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

	// ── Find the work, out on the DON ──
	//
	// This read has to happen on the DON runtime rather than in here: the EVM
	// capability takes a Runtime and TeeRuntime is not one. That costs nothing.
	// The claim id and its status are public values on a public chain, so a node
	// operator watching this request learns only what anyone reading the registry
	// already knows. Nothing that reaches the enclave later travels this way.
	//
	// Crossing out for one call does not end the handler's confidentiality. The
	// TeeRuntime is still the runtime for the secret and for the evidence fetch
	// below, and those are the two calls that carry anything worth hiding.
	const donRuntime = runtime.usingTheDons()
	const evmClient = new cre.capabilities.EVMClient(BigInt(config.chainSelector))

	/** One eth_call, decoded. Used for discovery and again for verification. */
	const callRegistry = (data: `0x${string}`) =>
		evmClient
			.callContract(donRuntime, {
				call: encodeCallMsg({
					from: zeroAddress,
					to: config.claimRegistryAddress as Address,
					data,
				}),
			})
			.result()

	let claimId: string
	let reportKind: 'verdict' | 'panel'

	if (config.pinnedClaimId) {
		if (!config.pinnedReportKind) {
			throw new Error('pinnedClaimId requires pinnedReportKind — see the config schema')
		}
		claimId = config.pinnedClaimId
		reportKind = config.pinnedReportKind
	} else {
		const call = callRegistry(
			encodeFunctionData({ abi: PENDING_ABI, functionName: 'pendingForTribunal' }),
		)

		const [pendingId, pendingKind] = decodeAbiParameters(
			parseAbiParameters('uint256, uint8'),
			bytesToHex(call.data),
		)

		// Nothing outstanding. Most ticks end here, having done one read.
		if (pendingId === 0n) return 'idle'

		claimId = pendingId.toString()
		reportKind = pendingKind === 1 ? 'panel' : 'verdict'
	}

	// Both secrets are released by the Vault DON directly into the attested
	// enclave. The salt binds the evidence commitment, so the published hash
	// cannot be brute-forced back to the sealed evidence; the envelope key is
	// the only thing that can open the evidence at all.
	//
	// Fetched together in one call rather than one each at the point of use. Two
	// separate getSecret calls in a single execution failed against the real DON
	// with a quorum error on the second, while the first succeeded — so the
	// batched form is the one that works, not merely the tidier one. The
	// simulator does not reproduce this, because it reads both from a local env
	// file and never talks to the Vault.
	const secrets = runtime
		.getSecrets(
			[config.secretId, config.envelopeSecretId]
				.filter((id): id is string => Boolean(id))
				.map((id) => ({ id, namespace: config.secretNamespace })),
		)
		.result()
	const salt = secrets[config.secretId].value

	// Fetch the two agents' sealed submissions from the evidence gateway.
	//
	// This is the load-bearing confidentiality: the request and the response both
	// stay inside the enclave, so node operators never see either party's raw
	// evidence or methodology. The agents publish independently and never see each
	// other's work — the bundle is the only place the two meet, and it meets
	// inside the TEE.
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, { url: `${config.evidenceGatewayBaseUrl}/${claimId}`, method: 'GET' })
		.result()

	// A witness is assigned the moment the VRF draw fulfils, which is before it
	// has read anything or published anything. So a claim can be the tribunal's
	// work and have no evidence yet, and that is a normal state rather than a
	// failure — the next tick will find it again. Throwing here would turn every
	// ordinary claim into a run of errors during the window between the draw and
	// the witness finishing.
	if (!ok(response)) {
		if (response.statusCode === 404) return `waiting for evidence on claim ${claimId}`
		throw new Error(`Evidence fetch failed with status: ${response.statusCode}`)
	}

	/*
	 * Open the envelope, in here and nowhere else.
	 *
	 * Confidential HTTP already hid the request and the response from node
	 * operators, but the store itself was a public gist and a URL is not an
	 * access control — anyone who had it could read both parties' evidence. Now
	 * the body is a ciphertext sealed to a key whose private half the Vault DON
	 * releases only into this attested enclave, so the store holds nothing
	 * readable and the confidentiality no longer rests on a URL staying obscure.
	 *
	 * The envelope is bound to its claim id as AEAD associated data, so swapping
	 * the gateway URL for a valid envelope from a DIFFERENT claim fails to open
	 * rather than adjudicating the wrong evidence. That matters here because the
	 * URL comes from config, which is not a commitment.
	 */
	const body = JSON.parse(text(response)) as unknown
	let raw: string
	if (isSealedEnvelope(body)) {
		if (!config.envelopeSecretId) {
			throw new Error('evidence is sealed but no envelopeSecretId is configured')
		}
		raw = openEnvelope(body, secrets[config.envelopeSecretId].value)
	} else {
		if (config.envelopeSecretId) {
			// Configured for sealed evidence and handed plaintext: refuse rather
			// than silently accept a downgrade someone could have forced.
			throw new Error('expected a sealed envelope, got plaintext')
		}
		raw = text(response)
	}

	const bundle = JSON.parse(raw) as {
		claimId: string
		claim: SealedSubmission
		witness: SealedSubmission
		panel?: { member: string; submission: SealedSubmission }[]
		/** The sentence that was bonded. Checked against the chain's claimHash. */
		claimText?: string
		/** The agent the roster assigned. Checked against the chain's witness. */
		witnessAgent?: { name: string; address: string }
	}

	// The envelope already refuses to open under the wrong claim id, so this is
	// belt and braces rather than the binding itself. It costs one comparison and
	// it catches a gateway that serves a well-formed bundle for the wrong claim.
	if (bundle.claimId !== claimId) {
		throw new Error(`gateway served claim ${bundle.claimId}, asked for ${claimId}`)
	}

	/*
	 * Check the bundle against the chain, rather than believing it.
	 *
	 * Everything above this point establishes that the evidence is the evidence
	 * someone sealed for this claim id. It does not establish that the SENTENCE
	 * in the bundle is the sentence the claimant actually bonded, or that the
	 * witness submission came from the agent VRF actually drew. Both of those
	 * arrived inside the bundle, from the same party that assembled it.
	 *
	 * That was the last thing the tribunal took on trust. It matters because the
	 * whole mechanism rests on a claimant being unable to change its claim after
	 * the money is down: a bundle carrying a softer sentence than the one on
	 * chain would be judged against the softer one, and the commitment published
	 * afterwards would attest to exactly that.
	 *
	 * The registry is already being read once per tick to find this claim, so
	 * reading it again costs one more eth_call and closes the gap. keccak of the
	 * bundle's text has to equal the claimHash in storage, and the witness in the
	 * bundle has to be the address the roster assigned.
	 *
	 * Fails closed. A bundle that cannot be checked is not a bundle that passes.
	 */
	const stored = decodeFunctionResult({
		abi: PENDING_ABI,
		functionName: 'claimOf',
		data: bytesToHex(callRegistry(
			encodeFunctionData({ abi: PENDING_ABI, functionName: 'claimOf', args: [BigInt(claimId)] }),
		).data),
	})

	if (!bundle.claimText) {
		throw new Error(`claim ${claimId}: bundle carries no claim text, so it cannot be checked against chain`)
	}
	const textHash = keccak256(toBytes(bundle.claimText))
	if (textHash.toLowerCase() !== stored.claimHash.toLowerCase()) {
		throw new Error(
			`claim ${claimId}: bundle text hashes to ${textHash}, chain bonded ${stored.claimHash}`,
		)
	}

	/*
	 * The witness check is skipped on an appeal.
	 *
	 * `recordPanelVerdict` is decided by the seated panel, and the registry's
	 * `witness` field still names the original witness — so requiring a match
	 * here would be checking the wrong party against the wrong record.
	 */
	if (reportKind === 'verdict') {
		const drawn = bundle.witnessAgent?.address
		if (!drawn) {
			throw new Error(`claim ${claimId}: bundle does not say which agent produced the witness submission`)
		}
		if (drawn.toLowerCase() !== stored.witness.toLowerCase()) {
			throw new Error(
				`claim ${claimId}: bundle credits witness ${drawn}, chain assigned ${stored.witness}`,
			)
		}
	}

	// On an appeal the panel's majority decides, not the original witness.
	const { verdict, confidence } =
		reportKind === 'panel' && bundle.panel && bundle.panel.length > 0
			? adjudicatePanel(
					bundle.claim,
					bundle.panel,
					config.toleranceBps,
					config.pinnedDeployments,
					config.freshnessSeconds,
				)
			: adjudicate(
					bundle.claim,
					bundle.witness,
					config.toleranceBps,
					config.pinnedDeployments,
					config.freshnessSeconds,
				)

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
	// donRuntime and evmClient were made at the top, for the registry read.

	// A Forwarder only ever calls onReport, so the report kind travels in the
	// payload rather than in the choice of entry point.
	const kind = reportKind === 'panel' ? 1 : 0
	const encodedPayload = encodeAbiParameters(
		parseAbiParameters('uint8 kind, uint256 claimId, uint8 verdict, bytes32 evidenceCommitment'),
		[kind, BigInt(claimId), verdict, evidenceCommitment],
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
	// msg.sender, and the sink's authorised writers are immutable — so those
	// addresses are read from the tenant's own chain list, never guessed.
	evmClient
		.writeReport(donRuntime, {
			receiver: config.verdictSinkAddress,
			report,
		})
		.result()

	return `claim=${claimId} kind=${reportKind} verdict=${verdict} confidence=${confidence}`
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
