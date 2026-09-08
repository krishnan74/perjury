// LLM backend for the agents. See docs/decisions.md ADR 0004.
//
// Two implementations behind one interface so the choice is not load-bearing:
//
//   claude-code  — shells out to `claude -p`, using the developer's existing
//                  Claude Code auth. No API key. Convenient for testing, but a
//                  judge reproducing the repo needs Claude Code installed and
//                  logged in, and temperature is not controllable.
//   anthropic    — direct API. Needs ANTHROPIC_API_KEY. Reproducible, cheaper
//                  per call, and supports temperature 0 — which the demo needs,
//                  since nondeterministic agents on camera are a recorded risk.
//
// Default is chosen by env: ANTHROPIC_API_KEY present ⇒ api, else claude-code.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

export interface LlmRequest {
  system: string;
  prompt: string;
  /** Ignored by the claude-code backend, which does not expose it. */
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  costUsd?: number;
  backend: "claude-code" | "anthropic";
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
  readonly backend: "claude-code" | "anthropic";
}

/** Cheapest model that can still follow a schema. Testing only. */
export const TEST_MODEL = "claude-haiku-4-5-20251001";

/**
 * Drives `claude -p`. Flags chosen to minimise prompt overhead:
 *  - runs in a temp cwd so the repo's CLAUDE.md is not loaded
 *  - `--allowed-tools ""` drops tool definitions
 *  - `--system-prompt` replaces the default agent prompt entirely
 *  - `--no-session-persistence` keeps every call a fresh context
 * Measured: ~$0.03/call vs ~$0.12 without these.
 */
export class ClaudeCodeClient implements LlmClient {
  readonly backend = "claude-code" as const;

  constructor(private readonly model: string = TEST_MODEL) {}

  complete(req: LlmRequest): Promise<LlmResponse> {
    const args = [
      "-p",
      "--output-format", "json",
      "--model", this.model,
      "--allowed-tools", "",
      "--no-session-persistence",
      "--exclude-dynamic-system-prompt-sections",
      "--system-prompt", req.system,
      req.prompt,
    ];

    return new Promise((resolve, reject) => {
      // cwd outside the repo: avoids loading CLAUDE.md into every call.
      const child = spawn("claude", args, { cwd: tmpdir(), stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(`claude -p exited ${code}: ${err.slice(0, 300)}`));
        try {
          const parsed = JSON.parse(out) as { result?: string; total_cost_usd?: number };
          resolve({
            text: (parsed.result ?? "").trim(),
            costUsd: parsed.total_cost_usd,
            backend: "claude-code",
          });
        } catch {
          reject(new Error(`unparseable output: ${out.slice(0, 300)}`));
        }
      });
    });
  }
}

/** Direct Anthropic API. Preferred for the demo — supports temperature 0. */
export class AnthropicClient implements LlmClient {
  readonly backend = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-sonnet-5",
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return { text: text.trim(), backend: "anthropic" };
  }
}

export function defaultClient(): LlmClient {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicClient(key) : new ClaudeCodeClient();
}

/** Pull the first JSON object out of a model response, tolerating prose or fences. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`no JSON object in response: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
