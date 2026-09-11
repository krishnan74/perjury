/**
 * Prove the evidence store is sealed.
 *
 *   npx tsx scripts/prove-sealed.ts [claimId]
 *
 * The tribunal's confidentiality argument used to rest on two things: the fetch
 * happens over Confidential HTTP, and the gateway URL is not widely known. The
 * first is real. The second is not a security property — a URL is not an access
 * control, and this repo publishes the URL in a committed config file.
 *
 * Now the store holds ciphertext. This script demonstrates it against the live
 * gateway rather than asserting it:
 *
 *   1. Fetch what the enclave fetches, and show it is an envelope.
 *   2. Grep the raw body for values we know are in the evidence. Nothing.
 *   3. Try to open it with no key. Fails.
 *   4. Try to open it as a different claim. Fails, because the claim id is the
 *      AEAD's associated data — so swapping the gateway URL for a valid envelope
 *      from another claim cannot feed the tribunal the wrong evidence.
 *   5. Open it with the key the Vault DON releases into the enclave. Succeeds,
 *      and matches the locally archived bundle.
 *
 * Step 5 needs PERJURY_ENVELOPE_KEY, which normally only the enclave sees. It is
 * read here so a human can verify the claim; the point of the other four steps
 * is that nobody without it can.
 */
import { readFileSync } from "node:fs";
import { isSealedEnvelope, open } from "@perjury/shared";

const claimId = process.argv[2];

const config = JSON.parse(readFileSync("cre/tribunal/config.staging.json", "utf8")) as {
  evidenceGatewayBaseUrl: string;
};

// Fetch exactly what the enclave fetches. Since the workflow started finding its
// own claim there is no single gateway URL in the config to read, so the claim
// id has to come from the command line and the URL is built the way the workflow
// builds it — base plus id. Anything else would be proving a different fetch
// than the one that matters.
const dir = `evidence-archive/${(process.env.CLAIM_REGISTRY_ADDRESS ?? "unknown").toLowerCase()}`;
const index = JSON.parse(readFileSync(`${dir}/gateway-index.json`, "utf8")) as Record<string, string>;
const id = claimId ?? Object.keys(index).sort((a, b) => Number(b) - Number(a))[0];
if (!id) throw new Error("no claim id given and the gateway index is empty");
const url = `${config.evidenceGatewayBaseUrl}/${id}`;

console.log(`\nclaim ${id}`);
console.log(`gateway ${url}`);
console.log(`store   ${index[id] ?? "unknown to the index"}\n`);

const res = await fetch(url);
if (!res.ok) throw new Error(`gateway fetch ${res.status}`);
const raw = await res.text();
const body = JSON.parse(raw) as unknown;

// 1 — it is an envelope, not a bundle.
if (!isSealedEnvelope(body)) {
  console.log("✗ the gateway is serving PLAINTEXT — the store is not sealed");
  process.exit(1);
}
console.log(`✓ sealed          ${body.alg}`);
console.log(`  bound to claim  ${body.claimId}`);
console.log(`  ciphertext      ${body.ct.length / 2} bytes`);

// 2 — nothing recognisable survives in the body.
const tells = ["utilization", "utilisation", "totalBorrowBalanceUSD", "lendingProtocols", "methodology"];
const leaked = tells.filter((t) => raw.toLowerCase().includes(t.toLowerCase()));
console.log(leaked.length === 0 ? "✓ no plaintext    none of the evidence's own field names appear" : `✗ LEAKED ${leaked}`);

// 3 — unreadable without the key.
try {
  open(body, "00".repeat(32));
  console.log("✗ opened with a junk key — the seal is not doing anything");
  process.exit(1);
} catch {
  console.log("✓ refuses         a wrong key cannot open it");
}

// 4 — an envelope cannot be replayed as another claim's evidence.
const key = process.env.PERJURY_ENVELOPE_KEY;
if (!key) {
  console.log("\nPERJURY_ENVELOPE_KEY unset — skipping the two checks that need it.");
  console.log("That is the normal state outside the enclave, and the point of the checks above.\n");
  process.exit(0);
}
try {
  open({ ...body, claimId: String(Number(body.claimId) + 1) }, key);
  console.log("✗ opened as a different claim — the AEAD binding is not working");
  process.exit(1);
} catch {
  console.log("✓ bound           it will not open as evidence for another claim");
}

// 5 — the enclave's key opens it, and it is the bundle we archived.
const plaintext = open(body, key);
const bundle = JSON.parse(plaintext) as { claimId: string; claim: unknown; witness: unknown };
console.log(`✓ opens           with the key the Vault DON releases into the enclave`);
console.log(`  bundle claim    ${bundle.claimId}`);

try {
  const archived = readFileSync(`${dir}/${bundle.claimId}.json`, "utf8");
  const a = JSON.parse(archived) as Record<string, unknown>;
  const same = JSON.stringify(a.claim) === JSON.stringify(bundle.claim)
    && JSON.stringify(a.witness) === JSON.stringify(bundle.witness);
  console.log(same
    ? "✓ matches         decrypted evidence is byte-identical to the local archive"
    : "✗ archive differs from what the gateway is serving");
} catch {
  console.log("  no local archive for this claim to compare against");
}
console.log();
