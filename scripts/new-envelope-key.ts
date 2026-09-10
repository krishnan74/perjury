/**
 * Generate the evidence envelope keypair.
 *
 *   npx tsx scripts/new-envelope-key.ts [--force]
 *
 * Writes both halves straight into the gitignored env files. It deliberately
 * does NOT print the private key: an earlier version echoed it to the terminal
 * so it could be pasted in by hand, which put a live secret into shell history,
 * scrollback and any transcript of the session. A generator that hands you a
 * secret to copy is a generator that leaks it.
 *
 *   cre/.env   PERJURY_ENVELOPE_KEY      private — released to the enclave only
 *   .env       PERJURY_ENVELOPE_PUBKEY   public  — safe to publish
 *
 * Rotating makes every previously sealed bundle unreadable. That is the intended
 * behaviour of an encrypted store, not a bug: the old evidence was confidential
 * to everyone but the enclave, and after a rotation it is confidential to
 * everyone. Hence --force.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { generateEnvelopeKey } from "@perjury/shared";

const force = process.argv.includes("--force");

const read = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

/** Replace the line if the key is already there, append if it is not. */
function upsert(path: string, key: string, value: string) {
  const body = read(path);
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(body)) {
    writeFileSync(path, body.replace(pattern, line));
  } else {
    appendFileSync(path, `${body.endsWith("\n") || body === "" ? "" : "\n"}${line}\n`);
  }
}

if (!force && /^PERJURY_ENVELOPE_KEY=.+$/m.test(read("cre/.env"))) {
  console.error("An envelope key already exists in cre/.env.");
  console.error("Rotating makes every sealed bundle unreadable. Pass --force if that is intended.");
  process.exit(1);
}

const { privateKey, publicKey } = generateEnvelopeKey();
upsert("cre/.env", "PERJURY_ENVELOPE_KEY", privateKey);
upsert(".env", "PERJURY_ENVELOPE_PUBKEY", publicKey);

console.log("Envelope key written.");
console.log(`  cre/.env  PERJURY_ENVELOPE_KEY     (private, not shown)`);
console.log(`  .env      PERJURY_ENVELOPE_PUBKEY  ${publicKey}`);
console.log("\nSet envelopeSecretId to ENVELOPE_KEY in the CRE configs.");
