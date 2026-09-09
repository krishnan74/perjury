// Terminal presentation for the demo scenes.
//
// The scenes are filmed, so output is built to be read at a glance on video:
// one idea per line, state changes shown before-and-after, and every on-chain
// claim accompanied by a transaction hash a viewer could check themselves.
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", grey: "\x1b[90m",
} as const;

const W = 78;
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - visibleLength(s)));
const visibleLength = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

export const c = C;

export function scene(n: number, title: string, subtitle: string) {
  console.log(`\n${C.bold}${C.cyan}${"━".repeat(W)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  SCENE ${n}${C.reset}${C.bold}  ${title}${C.reset}`);
  console.log(`${C.grey}  ${subtitle}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${"━".repeat(W)}${C.reset}`);
}

let stepN = 0;
export function step(label: string) {
  stepN += 1;
  console.log(`\n${C.bold}${C.blue}▸ ${stepN}. ${label}${C.reset}`);
}
export function resetSteps() { stepN = 0; }

export function line(label: string, value: string, colour: string = "") {
  console.log(`    ${C.grey}${pad(label, 26)}${C.reset}${colour}${value}${C.reset}`);
}

export function note(text: string) {
  console.log(`    ${C.grey}${text}${C.reset}`);
}

export function tx(label: string, hash: string) {
  console.log(`    ${C.grey}${pad(label, 26)}${C.reset}${C.dim}sepolia.etherscan.io/tx/${C.reset}${hash.slice(0, 18)}…`);
}

/** A claim about the world, shown so the viewer can judge it themselves. */
export function assertion(who: string, text: string, value: string, colour: string) {
  console.log(`    ${colour}${C.bold}${pad(who, 12)}${C.reset}${text}`);
  if (value) console.log(`    ${" ".repeat(12)}${colour}${C.bold}${value}${C.reset}`);
}

export function verdict(v: string, detail = "") {
  const colour = v === "Match" ? C.green : v === "Mismatch" ? C.red : C.yellow;
  console.log(`\n    ${colour}${C.bold}┌${"─".repeat(30)}┐${C.reset}`);
  console.log(`    ${colour}${C.bold}│  VERDICT: ${pad(v, 19)}│${C.reset}`);
  console.log(`    ${colour}${C.bold}└${"─".repeat(30)}┘${C.reset}`);
  if (detail) console.log(`    ${C.grey}${detail}${C.reset}`);
}

/** Before/after for a value the mechanism moved. */
export function change(label: string, before: string, after: string) {
  const worse = Number(after) < Number(before);
  const colour = Number.isNaN(Number(after)) ? C.cyan : worse ? C.red : C.green;
  const arrow = worse ? "↓" : "↑";
  console.log(
    `    ${C.grey}${pad(label, 26)}${C.reset}${C.dim}${before}${C.reset}  ${colour}${arrow}  ${C.bold}${after}${C.reset}`,
  );
}

export function agentTable(rows: { name: string; address: string; eligible: boolean; standing?: string }[]) {
  console.log(`    ${C.grey}${pad("AGENT", 24)}${pad("ADDRESS", 14)}${pad("STANDING", 10)}ELIGIBLE${C.reset}`);
  for (const r of rows) {
    const el = r.eligible ? `${C.green}yes${C.reset}` : `${C.red}no${C.reset}`;
    console.log(`    ${pad(r.name, 24)}${C.dim}${pad(r.address.slice(0, 10) + "…", 14)}${C.reset}${pad(r.standing ?? "—", 10)}${el}`);
  }
}

/** Waiting on something outside our control — VRF, a challenge window. */
export async function waitFor(label: string, check: () => Promise<boolean>, timeoutMs = 480_000) {
  const start = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      process.stdout.write(`\r\x1b[2K    ${C.green}✓${C.reset} ${label} ${C.grey}(${Math.round((Date.now() - start) / 1000)}s)${C.reset}\n`);
      return true;
    }
    // \r alone leaves the previous, longer line behind when piped or when the
    // timer digits shrink — clear to end of line so the spinner updates in place
    // on camera instead of smearing across the screen.
    process.stdout.write(`\r\x1b[2K    ${C.yellow}${frames[i++ % frames.length]}${C.reset} ${label} ${C.grey}${Math.round((Date.now() - start) / 1000)}s${C.reset}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  process.stdout.write(`\r\x1b[2K    ${C.red}✗${C.reset} ${label} timed out\n`);
  return false;
}

export function finale(lines: string[]) {
  console.log(`\n${C.bold}${C.cyan}${"━".repeat(W)}${C.reset}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log(`${C.bold}${C.cyan}${"━".repeat(W)}${C.reset}\n`);
}
