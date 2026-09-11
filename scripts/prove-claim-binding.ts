/**
 * Try to feed the tribunal a softer sentence than the one that was bonded.
 *
 *   npx tsx scripts/prove-claim-binding.ts [claimId]
 *
 * The claim that goes on chain is only a hash. The sentence itself travels
 * inside the sealed evidence, which is assembled off chain — so until the
 * tribunal checked, the party assembling the bundle could put a different
 * sentence in it than the one the claimant bonded, and the tribunal would judge
 * the claimant against the easier one and publish a commitment attesting to it.
 *
 * The whole mechanism rests on a claim being expensive to change once the money
 * is down. This is the script that shows it actually is.
 *
 * What it does: takes a settled claim's real evidence, weakens the claimant's
 * sentence, re-seals it to the tribunal's key under the SAME claim id so the
 * envelope still opens, publishes it, and points the gateway at it. Then it runs
 * the workflow and expects a refusal naming both hashes.
 *
 * It restores the gateway index afterwards, including if it throws.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { keccak256, toBytes } from "viem";
import { publishBundle, type EvidenceBundle } from "@perjury/gateway";

const claimId = process.argv[2] ?? "6";
const registry = (process.env.CLAIM_REGISTRY_ADDRESS ?? "").toLowerCase();
const dir = `evidence-archive/${registry}`;
const indexPath = `${dir}/gateway-index.json`;
const archivePath = `${dir}/${claimId}.json`;

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} unset`);
  return v;
};

if (!existsSync(archivePath)) {
  throw new Error(`no archived bundle for claim ${claimId} — run a scene first`);
}

const archived = JSON.parse(readFileSync(archivePath, "utf8")) as EvidenceBundle & {
  gatewayUrl?: string;
};
const honestText = archived.claimText;
if (!honestText) throw new Error(`claim ${claimId} has no claimText to tamper with`);

/**
 * Weaken the threshold rather than rewrite the sentence.
 *
 * A claim that no longer parses would be caught by something other than the
 * check being tested. Lowering the number keeps it a perfectly well-formed
 * claim about the same metric — just an easier one to satisfy, which is exactly
 * the edit a dishonest claimant would want.
 */
const tamperedText = honestText.replace(/([\d.]+)%/, (_m, n) =>
  `${(Number(n) / 2).toFixed(2)}%`,
);
if (tamperedText === honestText) throw new Error("could not find a threshold to weaken");

console.log(`\nclaim ${claimId}`);
console.log(`  bonded sentence : ${honestText}`);
console.log(`  tampered to     : ${tamperedText}`);
console.log(`  bonded hash     : ${keccak256(toBytes(honestText))}`);
console.log(`  tampered hash   : ${keccak256(toBytes(tamperedText))}\n`);

const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, string>;
/**
 * Restoring means putting back exactly what was there.
 *
 * If the claim had no index entry, "restore" is a delete rather than writing
 * undefined into the file — a JSON null would look like a published URL that
 * failed to load.
 */
const original: string | undefined = index[claimId];

function restoreIndex() {
  if (original === undefined) delete index[claimId];
  else index[claimId] = original;
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

async function main() {
  // Sealed to the real key, under the real claim id. The envelope will open.
  // This is deliberately NOT a test of the seal — it is a test of what the
  // tribunal does once the seal has opened and it is holding plausible evidence.
  const tampered: EvidenceBundle = { ...archived, claimText: tamperedText };
  const url = await publishBundle(tampered, need("PERJURY_ENVELOPE_PUBKEY"));
  console.log(`published tampered evidence: ${url}`);

  index[claimId] = url;
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  const cfgPath = "cre/tribunal/config.staging.json";
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const before = { pinnedClaimId: cfg.pinnedClaimId, pinnedReportKind: cfg.pinnedReportKind };
  cfg.pinnedClaimId = claimId;
  cfg.pinnedReportKind = "verdict";
  writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);

  console.log("\nrunning the tribunal against it (no broadcast)…\n");
  let out = "";
  try {
    out = execFileSync(
      `${process.env.HOME}/.cre/bin/cre`,
      ["workflow", "simulate", "tribunal", "--target", "staging-settings", "-e", ".env"],
      { encoding: "utf8", cwd: "cre", env: process.env, maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (e) {
    // A refusal is the expected outcome, and the CLI exits non-zero for it.
    out = `${(e as { stdout?: string }).stdout ?? ""}${(e as { stderr?: string }).stderr ?? ""}`;
  } finally {
    restoreIndex();
    const restore = JSON.parse(readFileSync(cfgPath, "utf8"));
    if (before.pinnedClaimId === undefined) delete restore.pinnedClaimId;
    else restore.pinnedClaimId = before.pinnedClaimId;
    if (before.pinnedReportKind === undefined) delete restore.pinnedReportKind;
    else restore.pinnedReportKind = before.pinnedReportKind;
    writeFileSync(cfgPath, `${JSON.stringify(restore, null, 2)}\n`);
  }

  const refused = /bundle text hashes to/.test(out);
  const adjudicated = /Adjudication complete/.test(out);

  if (refused && !adjudicated) {
    const line = out.split("\n").find((l) => l.includes("bundle text hashes to"))?.trim();
    console.log("✓ refused         the tribunal checked the sentence against the chain");
    console.log(`  ${line?.slice(0, 160)}`);
    console.log("\n✓ gateway index and workflow config restored\n");
    return;
  }

  console.log(adjudicated
    ? "✗ ADJUDICATED a claim whose text does not match the bonded hash"
    : "✗ failed for some other reason — read the output below");
  console.log(out.split("\n").slice(-25).join("\n"));
  process.exit(1);
}

main().catch((e) => {
  restoreIndex();
  console.error(e);
  process.exit(1);
});
