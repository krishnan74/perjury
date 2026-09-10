/**
 * Sealed envelopes: evidence that only the enclave can open.
 *
 * The gateway was the last plaintext in the system. Transport was confidential —
 * the enclave fetches over Confidential HTTP, so node operators never see the
 * request or the response — but the store itself was a public gist, and a URL
 * is not an access control. `docs/design.md` §3.2 recorded that as a gap and
 * §3.5 specified the fix: an encrypted blob whose key lives in the Vault DON.
 * This is that fix.
 *
 * The scheme is ECIES over secp256k1, chosen because the recipient key is then
 * an ordinary 32-byte hex string that a Vault DON secret can hold and an
 * operator can rotate without new tooling:
 *
 *   1. The sender generates an ephemeral keypair and does ECDH against the
 *      tribunal's public key, which is published in the workflow config.
 *   2. The symmetric key is sha256 over the compressed shared point.
 *   3. XChaCha20-Poly1305 encrypts the bundle. Its 24-byte nonce is random,
 *      so there is no counter to manage and no reuse to reason about.
 *   4. The claim id is the AEAD's associated data, so an envelope sealed for
 *      one claim cannot be replayed as the evidence for another. That is not
 *      hypothetical: the gateway URL lives in a config file, and without this
 *      binding an attacker who could swap the URL could feed the tribunal a
 *      valid envelope from a different claim.
 *
 * What this does NOT do: hide that a claim exists, hide the envelope's size, or
 * protect against a sender who publishes its own plaintext elsewhere. It closes
 * the store, not the world.
 */
/*
 * Import specifiers are the `.js` forms deliberately.
 *
 * The root tree has @noble/hashes 1.8 and the workflow's tree has 2.2, pulled
 * in as a transitive dependency of different viem versions. 2.x dropped the
 * extensionless subpath exports, so `@noble/hashes/sha256` resolves in one tree
 * and not the other. `sha2.js` and `utils.js` resolve in both, which is what
 * lets the cross-implementation test run at all.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/** Bumped only if the scheme changes. A reader must never guess the format. */
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALG = "ecies-secp256k1-xchacha20poly1305";

export interface SealedEnvelope {
  v: number;
  alg: string;
  /** Compressed ephemeral public key, hex. Public by construction. */
  epk: string;
  nonce: string;
  /** Ciphertext with the Poly1305 tag appended, hex. */
  ct: string;
  /**
   * Bound into the AEAD as associated data, and repeated here so a reader can
   * see what the envelope claims to be before opening it. Tampering with this
   * field makes the envelope fail to open rather than open as something else.
   */
  claimId: string;
}

const strip = (hex: string) => (hex.startsWith("0x") ? hex.slice(2) : hex);

/** Derive the symmetric key from a compressed shared point. */
function kdf(shared: Uint8Array): Uint8Array {
  return nobleSha256(shared);
}

/** The public key to publish in the workflow config, from a private key. */
export function envelopePublicKey(privateKeyHex: string): string {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(strip(privateKeyHex)), true));
}

/** Generate a recipient keypair. The private half belongs in the Vault DON. */
export function generateEnvelopeKey(): { privateKey: string; publicKey: string } {
  const priv = secp256k1.utils.randomPrivateKey();
  return {
    privateKey: bytesToHex(priv),
    publicKey: bytesToHex(secp256k1.getPublicKey(priv, true)),
  };
}

export function seal(plaintext: string, recipientPublicKeyHex: string, claimId: string): SealedEnvelope {
  const recipient = hexToBytes(strip(recipientPublicKeyHex));
  const ephemeral = secp256k1.utils.randomPrivateKey();
  const key = kdf(secp256k1.getSharedSecret(ephemeral, recipient, true));
  const nonce = randomBytes(24);

  const ct = xchacha20poly1305(key, nonce, utf8ToBytes(claimId)).encrypt(utf8ToBytes(plaintext));

  return {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG,
    epk: bytesToHex(secp256k1.getPublicKey(ephemeral, true)),
    nonce: bytesToHex(nonce),
    ct: bytesToHex(ct),
    claimId,
  };
}

/**
 * Open an envelope. Throws on any mismatch rather than returning null, because
 * every caller here treats a failure to open as fatal and a silent null would
 * be one `if` away from adjudicating an empty bundle.
 */
export function open(envelope: SealedEnvelope, recipientPrivateKeyHex: string): string {
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new Error(`unsupported envelope version ${envelope.v}`);
  }
  if (envelope.alg !== ENVELOPE_ALG) {
    throw new Error(`unsupported envelope algorithm ${envelope.alg}`);
  }
  const priv = hexToBytes(strip(recipientPrivateKeyHex));
  const key = kdf(secp256k1.getSharedSecret(priv, hexToBytes(strip(envelope.epk)), true));

  const pt = xchacha20poly1305(key, hexToBytes(strip(envelope.nonce)), utf8ToBytes(envelope.claimId))
    .decrypt(hexToBytes(strip(envelope.ct)));

  return new TextDecoder().decode(pt);
}

/** True when a fetched body looks like an envelope rather than a plain bundle. */
export function isSealedEnvelope(value: unknown): value is SealedEnvelope {
  const e = value as SealedEnvelope | null;
  return Boolean(e && typeof e === "object" && e.v === ENVELOPE_VERSION && typeof e.ct === "string");
}
