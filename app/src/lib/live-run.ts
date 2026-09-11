/**
 * Can this deployment actually post a claim?
 *
 * /submit spawns the agents, which means it needs a real Node process, the
 * repository on disk, the `gh` CLI for publishing evidence, and the agent keys.
 * A serverless host has none of those. Rather than let the route fail with a
 * stack trace in front of a judge, the page asks first and says what is missing.
 *
 * This is a real limit of the current build and is written down as one in ADR
 * 0011. The honest version of a feature that cannot run here is a sentence
 * explaining why, not a button that throws.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface RunCapability {
  ok: boolean;
  /** What is missing, in the order a reader would want to fix it. */
  missing: string[];
}

export function runCapability(): RunCapability {
  const missing: string[] = [];

  // The runner is spawned with the repository root as its working directory.
  if (!existsSync(join(process.cwd(), "..", "agents", "runner", "scene1.ts"))) {
    missing.push("the repository on disk — this build has only the compiled site");
  }
  // A claim costs a bond, which needs a key that can sign for an agent.
  if (!process.env.OPERATOR_PRIVATE_KEY) {
    missing.push("agent signing keys");
  }
  // The claimant and witness both read the indexer through the paid Gateway.
  if (!process.env.GRAPH_STUDIO_KEY) {
    missing.push("a Graph Gateway key");
  }
  // Evidence is published through the GitHub CLI, which no serverless runtime has.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    missing.push("a long-lived process — a serverless function cannot run a four-minute claim");
  }

  return { ok: missing.length === 0, missing };
}
