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
import { configuredAgents } from "./live/chain";

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

  // The agents fall back to the `claude -p` command line otherwise, which needs
  // Claude Code installed and logged in as a person. No server has that.
  if (!process.env.ANTHROPIC_API_KEY) missing.push("a model API key");

  // Evidence is sealed to the tribunal's public half before it goes anywhere.
  // Without it a run would publish plaintext, which is worse than not running.
  if (!process.env.PERJURY_ENVELOPE_PUBKEY) missing.push("the evidence envelope public key");

  // Publishing needs the GitHub API, because no serverless runtime has the CLI.
  if (!process.env.GITHUB_GIST_TOKEN) missing.push("a GitHub token for publishing evidence");

  return { ok: missing.length === 0, missing };
}
