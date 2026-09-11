/**
 * Can this deployment actually post a claim?
 *
 * The answer used to be "only on a developer's machine", because the route
 * spawned the runner and needed the repository on disk and a process that could
 * live for four minutes. Neither is true any more: the agents run in this
 * process, and the claim is a sequence of short steps the browser drives.
 *
 * What remains is credentials. A claim reads a paid indexer, reasons with a
 * model, seals evidence to the tribunal's key, publishes it somewhere the
 * enclave can fetch, and spends a bond. Each of those is a secret this
 * deployment either has or does not, and a missing one should produce a sentence
 * rather than a stack trace in front of whoever pressed the button.
 */
import { spawnSync } from "node:child_process";
import { configuredAgents } from "./live/chain";

/**
 * Is a command line tool available here?
 *
 * Two credentials have a working fallback through a tool a developer already has
 * logged in: the model through `claude`, and publishing through `gh`. Demanding
 * the API key regardless would block local development for no reason, and
 * pretending the fallback exists on a server would fail at the worst moment. So
 * the question is asked rather than assumed.
 */
function hasCommand(cmd: string): boolean {
  try {
    return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
  } catch {
    // No shell, or spawning is not permitted. Either way, not available.
    return false;
  }
}

export interface RunCapability {
  ok: boolean;
  /** What is missing, in the order a reader would want to fix it. */
  missing: string[];
}

export function runCapability(): RunCapability {
  const missing: string[] = [];

  // Bonds come from registered agents. No key, no claim.
  if (configuredAgents().length === 0) missing.push("an agent signing key");

  // Both agents read through the paid Gateway. Mocked data disqualifies the track.
  if (!process.env.GRAPH_STUDIO_KEY) missing.push("a Graph Gateway key");

  // The agents fall back to the `claude -p` command line, which needs Claude
  // Code installed and logged in as a person — fine on a laptop, absent on any
  // server.
  if (!process.env.ANTHROPIC_API_KEY && !hasCommand("claude")) {
    missing.push("a model API key (ANTHROPIC_API_KEY)");
  }

  // Evidence is sealed to the tribunal's public half before it goes anywhere.
  // Without it a run would publish plaintext, which is worse than not running.
  if (!process.env.PERJURY_ENVELOPE_PUBKEY) missing.push("the evidence envelope public key");

  // Publishing goes through the GitHub API when a token is set, and through the
  // CLI otherwise. No serverless runtime has the CLI.
  if (!process.env.GITHUB_GIST_TOKEN && !hasCommand("gh")) {
    missing.push("a GitHub token for publishing evidence (GITHUB_GIST_TOKEN)");
  }

  return { ok: missing.length === 0, missing };
}
