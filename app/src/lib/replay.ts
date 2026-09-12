/**
 * A settled claim, reduced to the shape the replay draws.
 *
 * Pure functions over events that have already been fetched — no reads happen in
 * this file. That matters more here than elsewhere on the site: the replay is the
 * page most tempted to invent a beat for narrative reasons, and a builder that
 * cannot reach the network can only arrange what the chain actually emitted.
 *
 * Where an artifact is missing, the builder returns `null` for that piece rather
 * than a plausible default, and the components render an explicit absence.
 */
import { VERDICT, type ClaimEvent, type ClaimRow, type VerdictName } from "./perjury";
import type { Agent } from "./roster";
import { identityOf, type Identity } from "./identity";
import {
  evidenceRows, queryVerified, reasoning,
  type Archive, type ArchivedSubmission,
} from "./evidence";

/**
 * The roster walk is bounded at 32 in `WitnessRoster.sol`, recorded in
 * docs/threat-audit.md. Mirrored rather than read, because the reconstruction
 * below has to agree with the deployed bytecode, not with a later roster.
 */
const MAX_WALK = 32;

/** Which side of the page a beat belongs to. The lanes never meet before the seal. */
export type Lane = "claimant" | "spine" | "witness";

export interface Beat {
  key: string;
  lane: Lane;
  /** Anchors the panels — the draw hangs off `draw`, the seal off `seal`. */
  kind: "claim" | "request" | "draw" | "verdict" | "appeal" | "panel" | "settle" | "payout" | "read";
  label: string;
  /**
   * The one fact this beat exists to deliver, set large.
   *
   * Every beat had a label and a muted detail line, which made a verdict look
   * exactly like a payout. A step in a narrated replay needs a single thing the
   * eye lands on, and it is different per beat: the sentence that was bonded,
   * who was drawn, the word the tribunal returned.
   */
  lead: string;
  detail: string;
  /** One sentence of plain English, so the page carries itself without narration. */
  note: string;
  /** Empty for a beat that is not a transaction — see `AgentRead`. */
  tx: string;
  block: string;
  /** Seconds between this beat and the one before it, as they actually happened. */
  gap: number;
  /** Present on `read` beats: what the agent asked, got and concluded. */
  read?: AgentRead;
  /** Whose beat this is, where a party owns it. */
  who?: Identity;
  /** The protocol doing the work at this step, where one is. */
  partner?: "chainlink" | "ens" | "graph";
}

/**
 * One agent's trip to the indexer.
 *
 * Every field is transcribed from the archive. `queryOk` is the one computed
 * value, and it is a check rather than a claim: the archived document either
 * hashes to the hash the guard recorded at read time or it does not.
 */
export interface AgentRead {
  role: "claimant" | "witness";
  deploymentId: string;
  block: number;
  chainHead: number;
  queriedAt: number;
  queryHash: string;
  query: string | null;
  /** null when no query was archived. Never defaults to true. */
  queryOk: boolean | null;
  sources: number;
  corroborated: boolean;
  /**
   * Every deployment consulted, primary first, and how far apart the furthest
   * two were.
   *
   * The count alone was not evidence of anything. "2 deployments" reads as a
   * reassurance until you can see which two and by how much they differed —
   * agreement within a few basis points across two independently written
   * mappings is the claim, and it is only checkable if the margin is shown.
   * Null on reads archived before corroboration was recorded.
   */
  deploymentIds: string[] | null;
  maxDivergenceBps: number | null;
  hasIndexingErrors: boolean;
  rows: { label: string; value: string }[];
  reasoning: string;
  asserted: number | null;
  unit: string;
  unverifiableReason?: string;
}

export interface DrawCandidate {
  address: string;
  name: string;
  index: number;
  /**
   * `claimant` is skipped by `cand != claimant` in `_assign` and can never be
   * drawn. `passed` means the walk reached this agent and moved on, which under
   * that same code means it was not eligible at that block. `unvisited` agents
   * the walk never reached — the draw stopped before them.
   */
  role: "claimant" | "drawn" | "passed" | "unvisited";
  /** Where in the walk this agent was visited, or null if it never was. */
  step: number | null;
}

export interface Draw {
  seed: string;
  rosterSize: number;
  /** `seed % agentList.length` — where the walk starts. */
  startIndex: number;
  candidates: DrawCandidate[];
  requestTx: string | null;
  drawTx: string;
  /** Real seconds between the VRF request and its fulfilment. */
  waitSeconds: number | null;
  /** The panel draw, when the claim was appealed. Three seats, one seed. */
  panel: { address: string; name: string }[];
}

export interface Seal {
  tx: string;
  block: string;
  verdict: VerdictName;
  /** The only trace the evidence leaves on chain. */
  commitment: string | null;
  /** Real seconds between the witness being assigned and the verdict landing. */
  adjudicationSeconds: number;
  /** Labels and bar widths for what went in and did not come out. */
  withheld: { label: string; ch: number }[];
  /**
   * The two values that went in, from the archive.
   *
   * Visible here only because the runner archives the bundle AFTER settlement.
   * Neither figure appears in any transaction, which is the point the panel is
   * making — so the component has to say why it can show them at all.
   */
  claimantValue: number | null;
  witnessValue: number | null;
  unit: string | null;
  /** Absolute distance between the two, in the assertion's own unit. */
  divergence: number | null;
  /**
   * Both composed documents, for the side-by-side comparison.
   *
   * Null where a run predates the capture. The corroboration argument rests on
   * the two documents being written independently, and a hash cannot show that
   * to anybody.
   */
  claimantQuery: string | null;
  witnessQuery: string | null;
  /**
   * The band inside which the two values count as agreeing.
   *
   * Derived from the tribunal's own rule rather than approximated. The test is
   * `|a-b| / max(|a|,|b|) <= bps/10000`, which is NOT symmetric about the
   * witness's value: a claimant below it passes down to `w(1-t)` and one above
   * it passes up to `w/(1-t)`. Drawing a symmetric band would show a passing
   * range the contract does not have.
   */
  band: { lo: number; hi: number; bps: number } | null;
  /**
   * Whether both parties' archived rows are byte-identical.
   *
   * When they are, a disagreement cannot be blamed on the data: the two agents
   * were handed the same numbers and did not reach the same conclusion. That is
   * the strongest thing this page can say, and it is a comparison of archived
   * values rather than an interpretation of them.
   */
  identicalEvidence: boolean | null;
}

/**
 * The appeal, as three independent re-derivations.
 *
 * `PanelSeated` names who the chain drew; the archive carries what each of them
 * concluded. Those used to be unjoinable — the archive labelled its seats
 * "seat-a", "seat-b", "seat-c", which are model assignments — so a finding could
 * not be attributed to the agent that produced it. Seats now carry the drawn
 * address, and a seat whose finding is missing says so rather than borrowing a
 * neighbour's.
 */
export interface PanelSeatView {
  address: string;
  name: string;
  /** Null where the archive predates the binding, or the seat was unverifiable. */
  value: number | null;
  unverifiableReason?: string;
  /** Whether this seat's value falls inside the tolerance band. */
  agrees: boolean | null;
}

export interface Appeal {
  appellant: { address: string; name: string } | null;
  seats: PanelSeatView[];
  /** The finding that stands. A panel verdict supersedes the original. */
  outcome: "upheld" | "overturned" | null;
  original: VerdictName;
  seatedTx: string | null;
  /** True when the archive could be joined to the drawn addresses at all. */
  bound: boolean;
}

export interface StandingMove {
  address: string;
  name: string;
  from: number;
  to: number;
  tx: string;
  /** Cooldown applied by `onMismatch`, in unix seconds. */
  flaggedUntil: number | null;
  /** Stake left after `slash`. Zero means the permanent flag was applied too. */
  stakeRemaining: string | null;
  /** Live roster state, read the same way the VRF callback reads it. */
  eligibleNow: boolean;
  exclusion: string | null;
}

export interface ReplayScript {
  claimId: string;
  /** Null when this claim has no archived bundle. The page says so. */
  archive: Archive | null;
  /** The drafted sentence, and whether it hashes to the bonded claimHash. */
  claimText: string | null;
  claimTextOk: boolean | null;
  /** The agent the archive says derived the witness half, and whether the chain agrees. */
  witnessBindingOk: boolean | null;
  verdict: VerdictName;
  claimant: { address: string; name: string };
  witness: { address: string; name: string } | null;
  appealed: boolean;
  beats: Beat[];
  draw: Draw | null;
  seal: Seal | null;
  appeal: Appeal | null;
  standing: StandingMove | null;
  totalSeconds: number;
}

/**
 * What the tribunal receives and never emits.
 *
 * The same six fields the claim detail page lists, with the same bar widths, so
 * the two pages agree about what is sealed. The widths are arbitrary and must
 * stay arbitrary — a bar sized to its value leaks the value's length.
 */
const WITHHELD = [
  { label: "claimant's value", ch: 14 },
  { label: "witness's value", ch: 13 },
  { label: "claimant's evidence", ch: 34 },
  { label: "witness's evidence", ch: 31 },
  { label: "methodologies", ch: 29 },
  { label: "query hashes", ch: 20 },
] as const;

/** Build the whole script. `mechanism` is the roster and standing-writer stream. */
export function buildScript(
  claim: ClaimRow,
  mechanism: ClaimEvent[],
  roster: Agent[],
  archive: Archive | null = null,
  claimTextOk: boolean | null = null,
  toleranceBps: number | null = null,
): ReplayScript {
  const named = (addr: string | null | undefined) => ({
    address: String(addr ?? ""),
    name: nameOf(roster, addr),
  });

  const mine = mechanism.filter((e) => e.claimId === claim.id);
  const beats = buildBeats(claim, roster, archive);

  // The archive names the agent that produced the witness half; the chain names
  // the agent VRF drew. They are recorded independently, so they can disagree —
  // and if they do, the page must not quietly show one of them.
  const archivedWitness = archive?.witnessAgent?.address?.toLowerCase();
  const witnessBindingOk =
    archivedWitness && claim.witness
      ? archivedWitness === claim.witness.toLowerCase()
      : null;

  return {
    claimId: claim.id,
    archive,
    claimText: archive?.claimText ?? null,
    claimTextOk,
    witnessBindingOk,
    verdict: claim.verdict,
    claimant: named(claim.claimant),
    witness: claim.witness ? named(claim.witness) : null,
    appealed: claim.appealed,
    beats,
    draw: buildDraw(claim, mine, roster),
    seal: buildSeal(claim, archive, toleranceBps),
    appeal: buildAppeal(claim, archive, roster, toleranceBps),
    standing: buildStanding(claim, mechanism, roster),
    totalSeconds: beats.reduce((sum, b) => sum + b.gap, 0),
  };
}

export function nameOf(roster: Agent[], addr: string | null | undefined): string {
  const hit = roster.find((a) => a.address.toLowerCase() === String(addr ?? "").toLowerCase());
  return hit?.name ?? shortAddr(String(addr ?? "—"));
}

const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a);

/** Wei to a short ETH figure. Amounts here are bonds and fees, never dust. */
const ethOf = (wei: unknown) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(Number(BigInt(String(wei ?? 0n))) / 1e18);

/**
 * Lane assignment.
 *
 * An event belongs to a lane when it concerns one party alone, and to the spine
 * when it is the protocol acting on both. Nothing crosses between the lanes —
 * there is no event that could, which is the mechanism, not the layout.
 */
const SCRIPT: Record<
  string,
  { lane: Lane; kind: Beat["kind"]; label: string; note: string; partner?: Beat["partner"] }
> = {
  ClaimSubmitted: {
    lane: "claimant",
    kind: "claim",
    label: "Claim submitted, bond escrowed",
    note: "The claimant states a figure it derived from an indexer and stakes ETH on it. The call takes a subject and a commitment; there is no parameter for a witness.",
  },
  // The draw is a protocol act, but the moment belongs to the witness: it is
  // when the witness enters, having had no say in it. The mechanics of the draw
  // itself are shown on the spine at this same row.
  WitnessAssigned: {
    partner: "chainlink",
    lane: "witness",
    kind: "draw",
    label: "Drawn as witness by VRF",
    note: "The witness did not volunteer and cannot decline. Assignment is pushed to it by a random draw it had no way to influence.",
  },
  VerdictRecorded: {
    partner: "chainlink",
    lane: "spine",
    kind: "verdict",
    label: "Tribunal returned a verdict",
    note: "Both sides' evidence went into a confidential handler. A verdict and a commitment came out, and nothing else did.",
  },
  Appealed: {
    lane: "claimant",
    kind: "appeal",
    label: "Appealed, appeal bond posted",
    note: "A verdict opens a challenge window rather than settling. Appealing costs a second, larger bond.",
  },
  PanelSeated: {
    partner: "chainlink",
    lane: "spine",
    kind: "panel",
    label: "VRF seated a panel of three",
    note: "A second draw, excluding the claimant, the original witness and the appellant. A panel containing any of them would not be review.",
  },
  PanelUpheld: {
    partner: "chainlink",
    lane: "spine",
    kind: "panel",
    label: "Panel upheld the verdict",
    note: "Three independently seated agents reached the same finding as the first witness.",
  },
  PanelOverturned: {
    partner: "chainlink",
    lane: "spine",
    kind: "panel",
    label: "Panel overturned the verdict",
    note: "The panel contradicted the original finding, and the contradicted party is slashed instead.",
  },
  ClaimantSlashed: {
    lane: "claimant",
    kind: "payout",
    label: "Claimant slashed",
    note: "Bond, appeal bond and registration stake are all forfeited. The forfeited bond is paid to nobody — paying it to the witness is what would make fabricated disagreement profitable.",
  },
  WitnessPaid: {
    lane: "witness",
    kind: "payout",
    label: "Witness paid its flat fee",
    note: "The same fee whichever way the verdict went, so the witness has nothing to gain by disagreeing.",
  },
  Settled: {
    partner: "ens",
    lane: "spine",
    kind: "settle",
    label: "Settled",
    note: "Settlement is permissionless and applies reputation, so an overturned verdict never reaches the ENS record.",
  },
};

/**
 * Protocol order, for events that share a block.
 *
 * Settlement emits `ClaimantSlashed`, `Settled` and `WitnessPaid` in one
 * transaction, and the event stream falls back to sorting those by name. That
 * happens to read correctly for this trio and would not for another — the
 * replay should not depend on where a letter falls in the alphabet.
 */
const ORDER = [
  "ClaimSubmitted",
  "WitnessAssigned",
  "VerdictRecorded",
  "Appealed",
  "PanelSeated",
  "PanelUpheld",
  "PanelOverturned",
  "ClaimantSlashed",
  "WitnessPaid",
  "Settled",
];

/**
 * Turn one archived submission into a read beat.
 *
 * Returns null when the agent could not verify — an Unverifiable submission has
 * no provenance and no value, and a card full of dashes would imply the read
 * happened and came back empty rather than that it never completed.
 */
function readBeat(
  s: ArchivedSubmission | undefined,
  role: "claimant" | "witness",
  who: Identity,
): { beat: Omit<Beat, "gap">; at: number } | null {
  if (!s?.attestation) return null;
  const p = s.attestation.provenance;

  const read: AgentRead = {
    role,
    deploymentId: p.deploymentId,
    block: p.indexedBlock,
    chainHead: p.chainHead,
    queriedAt: Math.floor(p.queriedAt / 1000),
    queryHash: p.queryHash,
    query: s.query ?? null,
    queryOk: queryVerified(s),
    sources: p.corroboration?.sources ?? 1,
    corroborated: p.corroboration?.corroborated ?? false,
    deploymentIds: p.corroboration?.deploymentIds ?? null,
    maxDivergenceBps: p.corroboration?.maxDivergenceBps ?? null,
    hasIndexingErrors: p.hasIndexingErrors,
    rows: evidenceRows(s),
    reasoning: reasoning(s),
    asserted: s.attestation.assertion.value,
    unit: s.attestation.assertion.unit,
    unverifiableReason: s.unverifiableReason,
  };

  return {
    at: read.queriedAt,
    beat: {
      key: `read-${role}-${p.queryHash.slice(0, 12)}`,
      lane: role,
      kind: "read",
      partner: "graph",
      label: role === "claimant" ? "Read the indexer, then drafted a claim" : "Read the indexer, independently",
      // The value it walked away with. The card below shows the working; this is
      // the number the next step will be decided on.
      lead: `${read.asserted}${read.unit === "percent" ? "%" : ` ${read.unit}`}`,
      detail: "",
      note:
        role === "claimant"
          ? "Before anything is bonded. The agent decides what it is willing to stake on, and only then stakes it."
          : "A separate process with its own key and no channel to the claimant. It replays against the block the claimant read.",
      // Not a transaction. Nothing about this reached the chain.
      tx: "",
      block: String(p.indexedBlock),
      read,
      who,
    },
  };
}

function buildBeats(claim: ClaimRow, roster: Agent[], archive: Archive | null): Beat[] {
  const claimantId = identityOf(nameOf(roster, claim.claimant), claim.claimant, "claimant");
  const witnessId = claim.witness
    ? identityOf(nameOf(roster, claim.witness), claim.witness, "witness")
    : null;

  const ordered = [...claim.events].sort(
    (a, b) =>
      Number(a.block - b.block) ||
      (ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99),
  );

  const chainBeats = ordered.map((e): { at: number; beat: Omit<Beat, "gap"> } => {
    const spec = SCRIPT[e.name] ?? {
      lane: "spine" as Lane,
      kind: "settle" as Beat["kind"],
      label: e.name,
      note: "",
    };

    /*
     * Lead and detail carry different weights, so they carry different facts.
     * The lead is what the step delivered; the detail is who or what it names.
     * Getting this wrong is what made a verdict and a fee payment look alike.
     */
    let lead = "";
    let detail = "";
    if (e.name === "WitnessAssigned") {
      lead = nameOf(roster, String(e.args.witness));
    } else if (e.name === "PanelSeated") {
      const seats = (e.args.panel as string[]).map((a) => nameOf(roster, a));
      lead = `${seats.length} seats, no party among them`;
      detail = seats.join(", ");
    } else if (e.name === "VerdictRecorded") {
      lead = VERDICT[Number(e.args.verdict)] ?? "";
    } else if (e.name === "PanelUpheld") {
      lead = "upheld";
      detail = VERDICT[Number(e.args.verdict)] ?? "";
    } else if (e.name === "PanelOverturned") {
      lead = "overturned";
    } else if (e.name === "ClaimSubmitted") {
      // The sentence that was actually bonded, where the archive kept it. Its
      // keccak is the claimHash in storage, so this is the thing at stake.
      lead = archive?.claimText ?? `${ethOf(e.args.bond)} ETH bonded`;
      detail = nameOf(roster, String(e.args.claimant));
    } else if (e.name === "Appealed") {
      lead = `${ethOf(e.args.bond)} ETH appeal bond`;
    } else if (e.name === "ClaimantSlashed") {
      lead = `${ethOf(BigInt(String(e.args.bond)) + BigInt(String(e.args.stakeSlashed)))} ETH forfeited`;
      detail = "bond and stake, payable to nobody";
    } else if (e.name === "WitnessPaid") {
      lead = `${ethOf(e.args.fee)} ETH`;
      detail = "the same fee whichever way the verdict went";
    } else if (e.name === "Settled") {
      lead = VERDICT[Number(e.args.verdict)] ?? "";
      detail = "reputation is applied here, not at adjudication";
    }

    return {
      at: e.timestamp,
      beat: {
        key: `${e.name}-${e.tx}`,
        lane: spec.lane,
        kind: spec.kind,
        label: spec.label,
        lead,
        detail,
        note: spec.note,
        partner: spec.partner,
        tx: e.tx,
        block: String(e.block),
        who: spec.lane === "claimant" ? claimantId : spec.lane === "witness" ? witnessId ?? undefined : undefined,
      },
    };
  });

  // The two off-chain reads are placed by the timestamp the guard recorded, not
  // by where the story would like them. On the current runner the claimant reads
  // before it bonds and the witness reads after it is drawn, which is the order
  // the protocol specifies — and if a future run breaks that, this will show it
  // rather than hide it.
  const reads = [
    readBeat(archive?.claim, "claimant", claimantId),
    witnessId ? readBeat(archive?.witness, "witness", witnessId) : null,
  ].filter((r): r is { beat: Omit<Beat, "gap">; at: number } => r !== null);

  const all = [...chainBeats, ...reads].sort((a, b) => a.at - b.at);

  let previous = all[0]?.at ?? 0;
  return all.map(({ at, beat }) => {
    const gap = Math.max(0, at - previous);
    previous = at;
    return { ...beat, gap };
  });
}

/**
 * Reconstruct the roster walk that produced the assignment.
 *
 * `_assign` starts at `seed % agentList.length` and steps forward, taking the
 * first candidate that is neither the claimant nor ineligible. Given the seed
 * and the agent that was drawn, the walk between them is determined — so this
 * shows a real draw rather than illustrating the idea of one.
 *
 * If the reconstruction does not land on the witness the chain recorded, the
 * roster has changed since the draw and the walk cannot be shown honestly. It
 * returns null, and the component says so instead of drawing a plausible walk.
 */
function buildDraw(claim: ClaimRow, mine: ClaimEvent[], roster: Agent[]): Draw | null {
  const drawn = mine.find((e) => e.name === "WitnessDrawn");
  if (!drawn || roster.length === 0) return null;

  const seed = BigInt(String(drawn.args.seed));
  const witness = String(drawn.args.witness).toLowerCase();
  const claimant = claim.claimant.toLowerCase();
  const len = roster.length;
  const startIndex = Number(seed % BigInt(len));

  const candidates: DrawCandidate[] = roster.map((a, index) => ({
    address: a.address,
    name: a.name,
    index,
    role: a.address.toLowerCase() === claimant ? "claimant" : "unvisited",
    step: null,
  }));

  let landed = false;
  for (let i = 0; i < Math.min(len, MAX_WALK); i++) {
    const at = (startIndex + i) % len;
    const cand = candidates[at]!;
    cand.step = i;
    if (cand.address.toLowerCase() === witness) {
      cand.role = "drawn";
      landed = true;
      break;
    }
    // Everything the walk stepped over was the claimant or ineligible at that
    // block. `_assign` has no third reason to pass an agent by.
    if (cand.role !== "claimant") cand.role = "passed";
  }
  if (!landed) return null;

  const requested = mine.find((e) => e.name === "WitnessRequested");
  const panelDrawn = mine.find((e) => e.name === "PanelDrawn");

  return {
    seed: seed.toString(),
    rosterSize: len,
    startIndex,
    candidates,
    requestTx: requested?.tx ?? null,
    drawTx: drawn.tx,
    waitSeconds: requested ? Math.max(0, drawn.timestamp - requested.timestamp) : null,
    panel: ((panelDrawn?.args.panel as string[] | undefined) ?? []).map((a) => ({
      address: a,
      name: nameOf(roster, a),
    })),
  };
}

/** The exact set of claimant values that `withinTolerance` accepts, given the witness's. */
function toleranceBand(witnessValue: number, bps: number): { lo: number; hi: number; bps: number } | null {
  const t = bps / 10_000;
  if (t <= 0 || t >= 1 || witnessValue === 0) return null;
  return { lo: witnessValue * (1 - t), hi: witnessValue / (1 - t), bps };
}

function buildSeal(claim: ClaimRow, archive: Archive | null, toleranceBps: number | null): Seal | null {
  const recorded = claim.events.find((e) => e.name === "VerdictRecorded");
  if (!recorded) return null;
  const assigned = claim.events.find((e) => e.name === "WitnessAssigned");

  const commitment = String(recorded.args.evidenceCommitment ?? "");

  const cv = archive?.claim.attestation?.assertion.value ?? null;
  const wv = archive?.witness.attestation?.assertion.value ?? null;

  // Compared as rendered rows rather than as raw objects, so key order and
  // formatting cannot make identical readings look different.
  let identical: boolean | null = null;
  if (archive?.claim.evidence && archive?.witness.evidence) {
    const a = JSON.stringify(evidenceRows(archive.claim));
    const b = JSON.stringify(evidenceRows(archive.witness));
    identical = a === b;
  }

  return {
    claimantValue: cv,
    witnessValue: wv,
    claimantQuery: archive?.claim.query ?? null,
    witnessQuery: archive?.witness.query ?? null,
    band: wv !== null && toleranceBps !== null ? toleranceBand(wv, toleranceBps) : null,
    unit: archive?.claim.attestation?.assertion.unit ?? null,
    divergence: cv !== null && wv !== null ? Math.abs(cv - wv) : null,
    identicalEvidence: identical,
    tx: recorded.tx,
    block: String(recorded.block),
    verdict: (VERDICT[Number(recorded.args.verdict)] ?? "None") as VerdictName,
    commitment: commitment || null,
    adjudicationSeconds: assigned ? Math.max(0, recorded.timestamp - assigned.timestamp) : 0,
    withheld: [...WITHHELD],
  };
}

/**
 * Join the drawn panel to what each seat concluded.
 *
 * Renders from chain alone when there is no archive: three agents were drawn and
 * the outcome is on chain, which is the whole of A4's Tier A requirement. The
 * archived values are an enrichment, and their absence is stated rather than
 * hidden.
 */
function buildAppeal(
  claim: ClaimRow,
  archive: Archive | null,
  roster: Agent[],
  toleranceBps: number | null,
): Appeal | null {
  const seated = claim.events.find((e) => e.name === "PanelSeated");
  if (!seated) return null;

  const drawn = (seated.args.panel as string[] | undefined) ?? [];
  const upheld = claim.events.find((e) => e.name === "PanelUpheld");
  const overturned = claim.events.find((e) => e.name === "PanelOverturned");

  const witnessValue = archive?.witness.attestation?.assertion.value ?? null;
  const t = toleranceBps === null ? null : toleranceBps / 10_000;

  const byAddress = new Map(
    (archive?.panel ?? []).map((p) => [p.member.toLowerCase(), p] as const),
  );
  const bound = drawn.some((a) => byAddress.has(a.toLowerCase()));

  const seats: PanelSeatView[] = drawn.map((address) => {
    const found = byAddress.get(address.toLowerCase());
    const value = found?.submission.attestation?.assertion.value ?? null;
    return {
      address,
      name: nameOf(roster, address),
      value,
      unverifiableReason: found?.submission.unverifiableReason,
      agrees:
        value === null || witnessValue === null || t === null
          ? null
          : Math.abs(value - witnessValue) / Math.max(Math.abs(value), Math.abs(witnessValue)) <= t,
    };
  });

  return {
    appellant: claim.events.find((e) => e.name === "Appealed")
      ? {
          address: String(claim.events.find((e) => e.name === "Appealed")!.args.appellant),
          name: nameOf(roster, String(claim.events.find((e) => e.name === "Appealed")!.args.appellant)),
        }
      : null,
    seats,
    outcome: upheld ? "upheld" : overturned ? "overturned" : null,
    original: claim.verdict,
    seatedTx: seated.tx,
    bound,
  };
}

/**
 * The reputation consequence, read from the write itself.
 *
 * `StandingUpdated` carries the old and new values, so the bar moves between two
 * numbers the chain published rather than between the current value and a delta
 * inferred from the verdict. It is indexed by ENS node and carries no address,
 * which is why the roster exposes `ensNode`.
 *
 * Standing is written at settlement, so the flag and the slash land in the same
 * transaction and are joined on it.
 */
function buildStanding(claim: ClaimRow, mechanism: ClaimEvent[], roster: Agent[]): StandingMove | null {
  const settled = claim.events.find((e) => e.name === "Settled");
  if (!settled) return null;

  const inTx = mechanism.filter((e) => e.tx === settled.tx);
  const updated = inTx.find((e) => e.name === "StandingUpdated");
  if (!updated) return null;

  const node = String(updated.args.node).toLowerCase();
  const agent = roster.find((a) => a.ensNode.toLowerCase() === node);
  if (!agent) return null;

  const flagged = inTx.find(
    (e) => e.name === "AgentFlagged" && String(e.args.agent).toLowerCase() === agent.address.toLowerCase(),
  );
  const slashed = inTx.find(
    (e) => e.name === "AgentSlashed" && String(e.args.agent).toLowerCase() === agent.address.toLowerCase(),
  );

  return {
    address: agent.address,
    name: agent.name,
    from: Number(updated.args.oldStanding),
    to: Number(updated.args.newStanding),
    tx: settled.tx,
    flaggedUntil: flagged ? Number(flagged.args.until) : null,
    stakeRemaining: slashed ? String(slashed.args.remainingStake) : null,
    eligibleNow: agent.eligible,
    exclusion: exclusionReason(agent),
  };
}

/**
 * Why the roster will not draw this agent, in the roster's own terms.
 *
 * Deliberately not "standing fell below the threshold" — there is no such
 * threshold. `isEligible` gates on the flag, the stake floor and whether the ENS
 * record can be read at all; the standing number is the permanent public record
 * and does not itself exclude anyone. Saying otherwise on the page would
 * describe a mechanism the contract does not have.
 */
function exclusionReason(agent: Agent): string | null {
  if (agent.eligible) return null;
  if (agent.stake === 0n) return "stake slashed to zero — flagged until it is topped up";
  if (agent.flaggedUntil > Math.floor(Date.now() / 1000)) return "serving the mismatch cooldown";
  if (!agent.standingReadable) return "ENS standing record unreadable — eligibility fails closed";
  return "not eligible";
}
