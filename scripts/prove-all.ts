/**
 * Run every claim this project makes, and print whether it held.
 *
 *   npm run prove              everything, including the two that write on chain
 *   npm run prove -- --fast    read-only proofs only, no gas, ~1 minute
 *
 * The individual proofs already existed, and each demonstrates a property
 * against live state rather than asserting it. What was missing was a way to
 * run them without knowing their names — so the honest answer to "can I check
 * this myself?" was six commands and an explanation of what each one covers.
 *
 * Each row states a property in the form someone would doubt it. A reviewer
 * should be able to read the claim, disbelieve it, and run the one line under
 * it. Nothing here is a unit test against a fixture: every proof reads Sepolia,
 * the live Gateway, or the deployed workflow.
 *
 * Pass/fail is the child's exit code, not a substring — three of these scripts
 * report a partial failure by setting `process.exitCode` while still printing
 * plenty of ticks, so grepping for a tick would call a broken run green. The
 * markers below are a second opinion: `absent` catches a script that exits 0
 * without having done its work.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// The proofs read the same `.env` the runners do, and have always been invoked
// from a shell that had already exported it. `npm run prove` has to work cold,
// so the root file is handed to each child. Node does not overwrite variables
// that are already set, so an exported shell environment still wins.
const envFlags = existsSync(".env") ? ["--env-file-if-exists=.env"] : [];

/**
 * The claim-binding proof shells out to the `cre` CLI, which lives in ~/.cre/bin
 * and is not on PATH in a fresh shell. Foundry and bun are added for the same
 * reason, so `npm run prove` does not depend on the caller's dotfiles.
 */
const childEnv = {
  ...process.env,
  PATH: [
    `${process.env.HOME}/.foundry/bin`,
    `${process.env.HOME}/.bun/bin`,
    `${process.env.HOME}/.cre/bin`,
    process.env.PATH ?? "",
  ].join(":"),
};

interface Proof {
  /** The property, phrased as a sceptic would put it back to you. */
  claim: string;
  script: string;
  /** True if the proof spends gas or writes on chain. Skipped under --fast. */
  writes?: boolean;
  /** Must appear in the output; absence means the script exited early. */
  present: RegExp;
  /** Must NOT appear. */
  absent?: RegExp;
  /** Printed under a failure — why anyone should care that this broke. */
  matters: string;
}

const PROOFS: Proof[] = [
  {
    claim: "The evidence store holds ciphertext, not evidence",
    script: "scripts/prove-sealed.ts",
    present: /✓ sealed/,
    absent: /✗/,
    matters:
      "If the store were readable, confidentiality would rest on a URL staying obscure.",
  },
  {
    claim: "Independent indexes must agree, or the claim is Unverifiable",
    script: "scripts/prove-corroboration.ts",
    present: /corroborated|single-source/,
    matters:
      "One index that is wrong would otherwise be indistinguishable from a fact. Corroboration is real for 1 of 13 subjects and labelled absent for the rest.",
  },
  {
    claim: "Every pinned deployment answers the one standardized query",
    script: "scripts/verify-pinned.ts",
    present: /✓/,
    matters:
      "Adding a protocol is only a config line if the same query really does work across all of them.",
  },
  {
    claim: "Only the tribunal can write an agent's standing",
    script: "scripts/prove-eac.ts",
    present: /All expectations held/,
    absent: /FAIL /,
    matters:
      "Reputation the subject can write is not reputation. Neither is reputation the operator can write.",
  },
  {
    claim: "An agent cannot bind standing to a name it was not issued",
    script: "scripts/prove-name-binding.ts",
    writes: true,
    present: /✓ refused[\s\S]*✓ refused[\s\S]*✓ registered/,
    matters:
      "Otherwise an agent attaches its own misbehaviour to somebody else's name, or squats a name to deny its holder.",
  },
  {
    claim: "A claim cannot be softened after the bond is posted",
    script: "scripts/prove-claim-binding.ts",
    writes: true,
    present: /✓ refused/,
    matters:
      "The tribunal judges a sentence that arrives inside the evidence. Without checking it against the bonded hash, a claimant could be judged on an easier claim than the one it staked on.",
  },
];

const c = {
  reset: "\x1b[0m", grey: "\x1b[90m", green: "\x1b[32m",
  red: "\x1b[31m", yellow: "\x1b[33m", bold: "\x1b[1m",
};

function run(p: Proof): { ok: boolean; detail: string } {
  let out = "";
  let exitOk = true;
  try {
    out = execFileSync("npx", ["tsx", ...envFlags, p.script], {
      encoding: "utf8",
      env: childEnv,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    out = `${e.stdout ?? ""}${e.stderr ?? ""}` || (e.message ?? "");
    exitOk = false;
  }
  if (!exitOk) return { ok: false, detail: lastLine(out) };
  if (!p.present.test(out)) return { ok: false, detail: "exited clean without finishing its work" };
  if (p.absent?.test(out)) return { ok: false, detail: lastLine(out) };
  return { ok: true, detail: "" };
}

/** The most useful line of a failure is usually the last non-empty one. */
function lastLine(out: string): string {
  const line = out.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean).pop();
  return (line ?? "no output").slice(0, 110);
}

const fast = process.argv.includes("--fast");
const selected = fast ? PROOFS.filter((p) => !p.writes) : PROOFS;

console.log(`\n${c.bold}Perjury — every claim, checked against live state${c.reset}`);
console.log(`${c.grey}Sepolia, the live Graph Gateway, and the deployed workflow. No fixtures.${c.reset}`);
if (fast) console.log(`${c.yellow}--fast: skipping the ${PROOFS.length - selected.length} proofs that spend gas${c.reset}`);
console.log();

const results: { p: Proof; ok: boolean; detail: string; ms: number }[] = [];
const width = Math.max(...selected.map((p) => p.claim.length));

for (const p of selected) {
  // Only on a terminal: piped output keeps every carriage return, so the
  // "running" line and its result would both survive into a log.
  if (process.stdout.isTTY) process.stdout.write(`  ${c.grey}· ${p.claim}${c.reset}`);
  const started = Date.now();
  const r = run(p);
  const ms = Date.now() - started;
  results.push({ p, ...r, ms });
  const mark = r.ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
  // Overwrite the in-progress line rather than leaving both.
  process.stdout.write(`${process.stdout.isTTY ? "\r" : ""}  ${mark} ${p.claim.padEnd(width)}  ${c.grey}${(ms / 1000).toFixed(0)}s${c.reset}\n`);
}

const failed = results.filter((r) => !r.ok);
console.log();

if (failed.length === 0) {
  console.log(`${c.green}${c.bold}All ${results.length} held.${c.reset}`);
  if (fast) console.log(`${c.grey}Run without --fast for the two that write on chain.${c.reset}`);
  console.log();
} else {
  console.log(`${c.red}${c.bold}${failed.length} of ${results.length} did not hold.${c.reset}\n`);
  for (const f of failed) {
    console.log(`  ${c.red}✗ ${f.p.claim}${c.reset}`);
    console.log(`    ${f.detail}`);
    console.log(`    ${c.grey}why it matters — ${f.p.matters}${c.reset}`);
    console.log(`    ${c.grey}on its own:     npx tsx ${f.p.script}${c.reset}\n`);
  }
  process.exitCode = 1;
}
