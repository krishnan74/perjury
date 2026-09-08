// Appeal panel. See docs/decisions.md ADR 0007.
//
// Each seat is an independent witness derivation of the same claim. Seats do not
// see each other's work, and none of them sees the original witness's — a panel
// that reviewed the disputed finding would be reviewing an argument rather than
// re-deriving an answer.
//
// Model diversity is deliberate, and borrowed from Immunity (ETHGlobal), which
// uses different model families as judges. Two agents running the same model on
// the same data share failure modes: if the model misreads a schema, both misread
// it identically and agree confidently on a wrong answer. Different models make
// correlated honest error less likely — which is a limitation we could otherwise
// only disclose.
import { witness, type Claim, type Finding } from "@perjury/witness";
import type { PanelFinding } from "@perjury/tribunal";
import { ClaudeCodeClient, TEST_MODEL, type LlmClient } from "@perjury/llm";

export interface PanelSeat {
  /** On-chain address of the drawn agent. */
  member: string;
  client: LlmClient;
  model: string;
}

/**
 * Assign a model per seat.
 *
 * With only Anthropic credentials available this is intra-family diversity —
 * different models, same provider, so it reduces correlated error without
 * eliminating it. Genuine cross-family diversity needs a second provider key,
 * and the interface already allows it: any LlmClient can be seated.
 */
export const DEFAULT_PANEL_MODELS = [
  TEST_MODEL, // haiku
  "claude-sonnet-5",
  TEST_MODEL,
] as const;

export function seatPanel(members: string[], models: readonly string[] = DEFAULT_PANEL_MODELS): PanelSeat[] {
  return members.map((member, i) => {
    const model = models[i % models.length] ?? TEST_MODEL;
    return { member, model, client: new ClaudeCodeClient(model) };
  });
}

/**
 * Run every seat against the same claim.
 *
 * Seats run concurrently and share nothing. A seat that throws is recorded as
 * unverifiable rather than failing the panel — one unreachable agent should not
 * decide an appeal, and `adjudicatePanel` already refuses to overturn without a
 * genuine majority.
 */
export async function runPanel(claim: Claim, seats: PanelSeat[]): Promise<PanelFinding[]> {
  return Promise.all(
    seats.map(async ({ member, client }): Promise<PanelFinding> => {
      try {
        const finding: Finding = await witness(claim, client);
        return {
          member,
          submission: {
            attestation: finding.attestation,
            methodology: finding.methodology,
            evidence: finding.evidence,
            unverifiableReason: finding.unverifiableReason,
          },
        };
      } catch (e) {
        return {
          member,
          submission: {
            attestation: null,
            methodology: `panel seat failed: ${e instanceof Error ? e.message : String(e)}`,
            evidence: null,
            unverifiableReason: "no-data",
          },
        };
      }
    }),
  );
}
