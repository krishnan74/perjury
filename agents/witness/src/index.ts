// The witness agent. See docs/design.md §5.2.
//
// Given a claim, it independently re-derives its own finding from live Graph
// data. It never sees the claimant's reasoning — that isolation is structural
// (separate process, separate key, no channel), not a prompt instruction.
//
// The split that matters: the LLM decides WHAT to query and HOW to map the
// result onto a typed assertion. It does not get to decide whether the data was
// trustworthy — graph-guard makes that call deterministically, because an agent
// cannot be relied on to report honestly about its own data.
import { composeDocument, queryCorroborated, deriveMetric, pinnedFor, rootEntityFor, type PinnedEntry } from "@perjury/graph-client";
import { isUnverifiable } from "@perjury/graph-guard";
import { defaultClient, extractJson, type LlmClient } from "@perjury/llm";
import type { Attestation, TypedAssertion, Comparator } from "@perjury/shared";
import { digestOf } from "@perjury/shared";

export interface Claim {
  claimId: string;
  subject: string;
  /** Prose, as an agent would actually post it. */
  text: string;
  /**
   * The metric identity the claimant committed to, taken verbatim.
   *
   * The witness derives the VALUE independently but must answer the SAME
   * question — otherwise two agents inventing their own names for the same
   * quantity disagree on the label while agreeing on the number, and the
   * tribunal reads that as incomparable. Independence belongs in the answer,
   * not in the question.
   */
  metric: string;
  unit: string;
  comparator: Comparator;
  /**
   * The block the claimant read, pinned so the witness answers about the same
   * chain state.
   *
   * Without it the two parties read whatever was latest at their own moment, and
   * state that moved in between shows up as disagreement. That never convicted
   * an honest claimant — the tribunal returns Unverifiable rather than Mismatch
   * for readings too far apart — but it did mean honest claims could simply fail
   * to resolve. Pinning removes the drift instead of tolerating it.
   */
  atBlock?: number;
}

export interface Finding {
  attestation: Attestation | null;
  methodology: string;
  unverifiableReason?: string;
  /**
   * Raw rows the assertion was derived from.
   *
   * Confidential for the duration of adjudication, not forever: the enclave
   * fetches it over Confidential HTTP, and the runner archives it after
   * settlement so a verdict can be audited. See docs/decisions.md.
   */
  evidence: unknown;
  /** The GraphQL document this agent composed and sent. */
  query?: string;
}

const PLAN_SYSTEM = `You translate a prose claim about DeFi protocol metrics into a GraphQL query and a typed assertion schema.
Output ONLY a JSON object, no prose, no code fences.`;

const READ_SYSTEM = `You extract one numeric metric from GraphQL results and state it as a typed assertion.
Output ONLY a JSON object, no prose, no code fences.`;

interface QueryPlan {
  selection: string;
  claimedValue: number;
  reasoning: string;
}

/** Step 1 — the agent composes its own query against the pinned schema. */
async function planQuery(llm: LlmClient, claim: Claim, pinned: PinnedEntry): Promise<QueryPlan> {
  const res = await llm.complete({
    system: PLAN_SYSTEM,
    temperature: 0,
    prompt: `Subgraph: ${pinned.protocolName} (${pinned.schema} schema).
Available metrics on the protocol entity: ${pinned.metrics.join(", ")}.
The protocol-level aggregates for this schema live on "${rootEntityFor(pinned.schema)}" — not on "protocols",
which is the shared interface and does not carry them.
This subgraph indexes exactly one protocol, so select ${rootEntityFor(pinned.schema)} with NO where-filter.
Do not guess filter values — a filter that matches nothing yields an empty result and the
finding will be rejected as unverifiable.

Claim to verify: "${claim.text}"
The claim is about the metric "${claim.metric}" measured in ${claim.unit}.

Return JSON:
{
  "selection": "<ONLY the root selection set, e.g. ${rootEntityFor(pinned.schema)} { ${pinned.metrics.slice(0, 2).join(" ")} }. No outer braces, no query keyword, and do NOT include _meta — it is added automatically.>",
  "claimedValue": <the numeric threshold the claim asserts>,
  "reasoning": "<one sentence on why this query lets you compute ${claim.metric} independently>"
}`,
  });
  return extractJson<QueryPlan>(res.text);
}

/** Step 2 — the agent interprets the rows into its own assertion. */
async function deriveAssertion(
  llm: LlmClient,
  claim: Claim,
  plan: QueryPlan,
  data: unknown,
  indexedBlock: number,
): Promise<TypedAssertion> {
  const res = await llm.complete({
    system: READ_SYSTEM,
    temperature: 0,
    prompt: `Claim: "${claim.text}"
Metric under test: ${claim.metric} (${claim.unit})
Query results: ${JSON.stringify(data).slice(0, 4000)}

Compute the actual value of ${claim.metric} from the results. If it is a percentage or ratio, compute it from the underlying figures and express it as a percentage (0-100).

Return JSON: { "value": <the ACTUAL value you derived from the data> }`,
  });
  const out = extractJson<{ value: number }>(res.text);
  // Metric identity comes from the claim; only the value is the witness's own.
  return {
    subject: claim.subject,
    chain: pinnedFor(claim.subject).chain,
    metric: claim.metric,
    comparator: claim.comparator,
    value: Number(out.value),
    unit: claim.unit,
    asOfBlock: indexedBlock,
  };
}

/**
 * Produce an independent finding for a claim.
 *
 * Any provenance failure returns UNVERIFIABLE rather than a value — there is no
 * path here that degrades into an implicit pass.
 */
export async function witness(claim: Claim, llm: LlmClient = defaultClient()): Promise<Finding> {
  const pinned = pinnedFor(claim.subject);

  try {
    const plan = await planQuery(llm, claim, pinned);

    // graph-client runs the guard: pinned deployment, freshness, indexing errors,
    // and — where a second deployment independently indexes this protocol —
    // agreement between them. Divergence throws, and the catch below turns it
    // into UNVERIFIABLE: if the indexers themselves disagree about what the chain
    // says, the fact is contested and no claimant may be convicted on it.
    const { data, provenance } = await queryCorroborated<Record<string, unknown>>(
      claim.subject,
      plan.selection,
      (d) => deriveMetric(d, claim.metric),
      {},
      process.env.GRAPH_STUDIO_KEY ?? "",
      claim.atBlock,
    );

    const assertion = await deriveAssertion(llm, claim, plan, data, provenance.indexedBlock);

    return {
      attestation: { provenance, assertion, digest: digestOf(provenance, assertion) },
      methodology:
        `witness: ${pinned.protocolName} via ${pinned.schema}; ${plan.reasoning}` +
        ` [${provenance.corroboration?.sources ?? 1} independent deployment(s)` +
        `${claim.atBlock ? `, pinned @ ${claim.atBlock}` : ""}]`,
      query: composeDocument(plan.selection, claim.atBlock ?? provenance.indexedBlock),
      evidence: data,
    };
  } catch (e) {
    if (isUnverifiable(e)) {
      return {
        attestation: null,
        // Keep the detail: "unverifiable" with no reason is undebuggable.
        methodology: `witness: provenance check failed — ${e.message}`,
        unverifiableReason: e.reason,
        evidence: null,
      };
    }
    throw e;
  }
}
