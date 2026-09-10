import { describe, expect, it } from "vitest";
import {
  generateEnvelopeKey,
  envelopePublicKey,
  isSealedEnvelope,
  open,
  seal,
} from "../src/envelope";
// The enclave's own copy. Imported by path on purpose: the workflow is a
// separate project that cannot resolve @perjury/*, so the code is duplicated,
// and this test is what stops the two drifting apart.
import { open as openInEnclave } from "../../../cre/tribunal/envelope";

const bundle = JSON.stringify({ claimId: "23", claim: { value: 64.72 }, witness: { value: 40.47 } });

describe("sealed envelope", () => {
  it("round-trips through the shared implementation", () => {
    const { privateKey, publicKey } = generateEnvelopeKey();
    expect(open(seal(bundle, publicKey, "23"), privateKey)).toBe(bundle);
  });

  /**
   * The one that matters. The gateway seals with packages/shared and the
   * tribunal opens with its own copy inside the enclave; if those two ever
   * disagree, every verdict fails in production and nothing here would have
   * caught it.
   */
  it("opens in the enclave exactly what the gateway sealed", () => {
    const { privateKey, publicKey } = generateEnvelopeKey();
    expect(openInEnclave(seal(bundle, publicKey, "23"), privateKey)).toBe(bundle);
  });

  it("derives the published public key from the secret", () => {
    const { privateKey, publicKey } = generateEnvelopeKey();
    expect(envelopePublicKey(privateKey)).toBe(publicKey);
    expect(envelopePublicKey(`0x${privateKey}`)).toBe(publicKey);
  });

  /**
   * The gateway URL lives in a config file rather than in a commitment, so an
   * envelope has to refuse to be read as evidence for a claim it was not sealed
   * for. Otherwise swapping the URL hands the tribunal a valid envelope from
   * some other claim.
   */
  it("refuses to open as a different claim", () => {
    const { privateKey, publicKey } = generateEnvelopeKey();
    const envelope = seal(bundle, publicKey, "23");
    expect(() => open({ ...envelope, claimId: "24" }, privateKey)).toThrow();
    expect(() => openInEnclave({ ...envelope, claimId: "24" }, privateKey)).toThrow();
  });

  it("refuses the wrong key", () => {
    const a = generateEnvelopeKey();
    const b = generateEnvelopeKey();
    expect(() => open(seal(bundle, a.publicKey, "23"), b.privateKey)).toThrow();
  });

  it("refuses a tampered ciphertext", () => {
    const { privateKey, publicKey } = generateEnvelopeKey();
    const e = seal(bundle, publicKey, "23");
    const flipped = `${e.ct.slice(0, -2)}${e.ct.slice(-2) === "00" ? "01" : "00"}`;
    expect(() => open({ ...e, ct: flipped }, privateKey)).toThrow();
  });

  it("refuses a version or algorithm it does not know", () => {
    const { privateKey, publicKey } = generateEnvelopeKey();
    const e = seal(bundle, publicKey, "23");
    expect(() => open({ ...e, v: 2 }, privateKey)).toThrow(/version/);
    expect(() => open({ ...e, alg: "rot13" }, privateKey)).toThrow(/algorithm/);
    expect(() => openInEnclave({ ...e, v: 2 }, privateKey)).toThrow(/version/);
  });

  it("recognises an envelope without opening it", () => {
    const { publicKey } = generateEnvelopeKey();
    expect(isSealedEnvelope(seal(bundle, publicKey, "23"))).toBe(true);
    expect(isSealedEnvelope(JSON.parse(bundle))).toBe(false);
    expect(isSealedEnvelope(null)).toBe(false);
  });

  it("produces a different ciphertext every time for the same input", () => {
    const { publicKey } = generateEnvelopeKey();
    const a = seal(bundle, publicKey, "23");
    const b = seal(bundle, publicKey, "23");
    expect(a.ct).not.toBe(b.ct);
    expect(a.epk).not.toBe(b.epk);
  });
});
