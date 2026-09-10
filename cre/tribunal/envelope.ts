/**
 * Opening a sealed envelope, inside the enclave.
 *
 * This mirrors `open()` in packages/shared/src/envelope.ts. It is duplicated
 * rather than imported because the workflow is a separate project with its own
 * dependency tree and is compiled to WASM — `@perjury/*` does not resolve here.
 *
 * Duplication is a drift risk and this repo has been bitten by exactly that
 * before: an agent recomposed a GraphQL document instead of recording the one
 * it sent, and the archived query stopped hashing to its own hash. So the two
 * implementations are pinned together by a test that seals with the shared
 * package and opens with THIS file. If they ever diverge, that test fails
 * rather than a verdict quietly failing in production.
 *
 * Only `open` lives here. The enclave never seals anything, and code that
 * cannot encrypt cannot accidentally publish something it thought it had.
 */
/*
 * The `.js` specifiers are deliberate. This tree has @noble/hashes 2.x, which
 * dropped the extensionless subpath exports that the root tree's 1.x still has;
 * the suffixed forms resolve in both, which is what lets one test seal with the
 * shared package and open with this file.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'

export const ENVELOPE_VERSION = 1
export const ENVELOPE_ALG = 'ecies-secp256k1-xchacha20poly1305'

export type SealedEnvelope = {
	v: number
	alg: string
	epk: string
	nonce: string
	ct: string
	claimId: string
}

const strip = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex)

/**
 * Throws on any mismatch. A failure to open must stop adjudication rather than
 * degrade into judging an empty bundle, which is the same fail-closed rule the
 * guard applies to a stale read.
 */
export function open(envelope: SealedEnvelope, recipientPrivateKeyHex: string): string {
	if (envelope.v !== ENVELOPE_VERSION) {
		throw new Error(`unsupported envelope version ${envelope.v}`)
	}
	if (envelope.alg !== ENVELOPE_ALG) {
		throw new Error(`unsupported envelope algorithm ${envelope.alg}`)
	}

	const priv = hexToBytes(strip(recipientPrivateKeyHex))
	const shared = secp256k1.getSharedSecret(priv, hexToBytes(strip(envelope.epk)), true)
	const key = sha256(shared)

	// The claim id is the AEAD's associated data, so an envelope sealed for one
	// claim cannot be replayed as the evidence for another. The gateway URL is
	// config, not a commitment, and without this binding swapping that URL would
	// hand the tribunal a perfectly valid envelope from a different claim.
	const pt = xchacha20poly1305(key, hexToBytes(strip(envelope.nonce)), utf8ToBytes(envelope.claimId)).decrypt(
		hexToBytes(strip(envelope.ct)),
	)

	return new TextDecoder().decode(pt)
}

export function isSealedEnvelope(value: unknown): value is SealedEnvelope {
	const e = value as SealedEnvelope | null
	return Boolean(e && typeof e === 'object' && e.v === ENVELOPE_VERSION && typeof e.ct === 'string')
}
