// The claimant agent. See docs/design.md §0.2 step 1.
//
// Posts a claim it is willing to bond. Structurally identical to the witness in
// how it reaches data — same guard, same pinning — but it never shares a process,
// a key, or a channel with the witness. That isolation is what makes the
// witness's finding independent rather than a second opinion on the same work.
//
// It can also be told to lie. Scene 2 of the demo needs a claim that is false in
// a way a witness will actually catch, and fabricating that honestly means
// deriving the true value first and then stating something else.
import { queryCorroborated, deriveMetric, pinnedFor, rootEntityFor, type PinnedEntry } from "@perjury/graph-client";
import { isUnverifiable } from "@perjury/graph-guard";
import { defaultClient, extractJson, type LlmClient } from "@perjury/llm";
import { digestOf, type Attestation, type Comparator, type TypedAssertion } from "@perjury/shared";

export interface ClaimDraft {
  subject: string;
  /** Prose, as posted on-chain (hashed into claimHash). */
  text: string;
  assertion: TypedAssertion;
  attestation: Attestation | null;
  methodology: string;
  evidence: unknown;
  unverifiableReason?: string;
  /** The GraphQL document this agent composed and sent. */
  query?: string;
  /** True when the agent was instructed to misstate its finding. */
  fabricated: boolean;
}

export type Honesty =
  | { mode: "honest" }
  /** Overstate the true value by this fraction, e.g. 0.5 = 50% higher. */
  | { mode: "false"; overstateBy: number };

const SYSTEM = `You turn DeFi protocol metrics into a claim and a GraphQL query. Output ONLY a JSON object, no prose, no code fences.`;

interface Plan {
  selection: string;
  metric: string;
  unit: string;
  comparator: Comparator;
  reasoning: string;
}

async function plan(llm: LlmClient, pinned: PinnedEntry, metric: string): Promise<Plan> {
  const res = await llm.complete({
    system: SYSTEM,
    temperature: 0,
    prompt: `Subgraph: ${pinned.protocolName} (${pinned.schema} schema).
Available metrics on the protocol entity: ${pinned.metrics.join(", ")}.
The protocol-level aggregates for this schema live on "${rootEntityFor(pinned.schema)}" — not on
"protocols", which is the shared interface and does not carry them. This subgraph indexes exactly
one protocol, so select ${rootEntityFor(pinned.schema)} with NO where-filter — do not guess filter values.

We want to make a claim about: ${metric}

Return JSON:
{ "selection": "<ONLY the root selection set, no outer braces, no _meta — it is added automatically>",
  "metric": "<metric field or derived name>", "unit": "<USD or percent>",
  "comparator": "gt", "reasoning": "<one sentence>" }`,
  });
  return extractJson<Plan>(res.text);
}

async function deriveValue(
  llm: LlmClient,
  plan: Plan,
  data: unknown,
): Promise<number> {
  const res = await llm.complete({
    system: `You extract one numeric value from GraphQL results. Output ONLY JSON.`,
    temperature: 0,
    prompt: `Metric: ${plan.metric} (${plan.unit})
Results: ${JSON.stringify(data).slice(0, 4000)}

If the metric is a ratio or percentage, compute it from the underlying figures and express it as a
percentage (0-100).

Return JSON: { "value": <the actual value> }`,
  });
  return Number(extractJson<{ value: number }>(res.text).value);
}

/**
 * Draft a claim about a metric.
 *
 * In `false` mode the agent still derives the true value from live data and then
 * states a different one. The claim is a lie about reality, not a lie about a
 * broken query — which is the only kind of falsehood the tribunal can meaningfully
 * catch, and the only kind worth demonstrating.
 */
export async function draftClaim(
  subject: string,
  metric: string,
  honesty: Honesty = { mode: "honest" },
  llm: LlmClient = defaultClient(),
): Promise<ClaimDraft> {
  const pinned = pinnedFor(subject);

  try {
    const p = await plan(llm, pinned, metric);
    // Corroborated like the witness's read: the claimant is held to the same
    // data standard it will be judged against, so a contested reading is caught
    // before a bond is ever posted rather than after.
    const { data, provenance, queryDocument } = await queryCorroborated<Record<string, unknown>>(
      subject,
      p.selection,
      (d) => deriveMetric(d, metric),
    );
    const trueValue = await deriveValue(llm, p, data);

    const fabricated = honesty.mode === "false";
    // A threshold just under the true value makes an honest "greater than" claim.
    const honestThreshold = Math.floor(trueValue * 0.95 * 100) / 100;
    const statedThreshold = fabricated
      ? Math.round(trueValue * (1 + honesty.overstateBy) * 100) / 100
      : honestThreshold;

    const assertion: TypedAssertion = {
      subject,
      chain: pinned.chain,
      metric: p.metric,
      comparator: p.comparator,
      // The claimant asserts the value it is willing to bond on.
      value: fabricated ? statedThreshold : trueValue,
      unit: p.unit,
      asOfBlock: provenance.indexedBlock,
    };

    return {
      subject,
      text: `${pinned.protocolName} ${p.metric} is above ${statedThreshold}${p.unit === "percent" ? "%" : " USD"}.`,
      assertion,
      attestation: { provenance, assertion, digest: digestOf(provenance, assertion) },
      methodology: `claimant: ${pinned.protocolName} via ${pinned.schema}; ${p.reasoning}`,
      // The document the client actually sent, so it hashes to the queryHash in
      // provenance. Recomposing it here did not reliably reproduce that string.
      query: queryDocument,
      evidence: data,
      fabricated,
    };
  } catch (e) {
    if (isUnverifiable(e)) {
      return {
        subject,
        text: `(unverifiable) ${metric}`,
        assertion: { subject, chain: pinned.chain, metric, comparator: "gt", value: 0, unit: "", asOfBlock: 0 },
        attestation: null,
        methodology: `claimant: provenance check failed — ${e.message}`,
        evidence: null,
        unverifiableReason: e.reason,
        fabricated: false,
      };
    }
    throw e;
  }
}
