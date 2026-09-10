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
  kind: "claim" | "request" | "draw" | "verdict" | "appeal" | "panel" | "settle" | "payout";
  label: string;
  detail: string;
  /** One sentence of plain English, so the page carries itself without narration. */
  note: string;
  tx: string;
  block: string;
  /** Seconds between this beat and the one before it, as they actually happened. */
  gap: number;
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
  verdict: VerdictName;
  claimant: { address: string; name: string };
  witness: { address: string; name: string } | null;
  appealed: boolean;
  beats: Beat[];
  draw: Draw | null;
  seal: Seal | null;
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
): ReplayScript {
  const named = (addr: string | null | undefined) => ({
    address: String(addr ?? ""),
    name: nameOf(roster, addr),
  });

  const mine = mechanism.filter((e) => e.claimId === claim.id);
  const beats = buildBeats(claim, roster);

  return {
    claimId: claim.id,
    verdict: claim.verdict,
    claimant: named(claim.claimant),
    witness: claim.witness ? named(claim.witness) : null,
    appealed: claim.appealed,
    beats,
    draw: buildDraw(claim, mine, roster),
    seal: buildSeal(claim),
    standing: buildStanding(claim, mechanism, roster),
    totalSeconds: beats.reduce((sum, b) => sum + b.gap, 0),
  };
}

export function nameOf(roster: Agent[], addr: string | null | undefined): string {
  const hit = roster.find((a) => a.address.toLowerCase() === String(addr ?? "").toLowerCase());
  return hit?.name ?? shortAddr(String(addr ?? "—"));
}

const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a);

/**
 * Lane assignment.
 *
 * An event belongs to a lane when it concerns one party alone, and to the spine
 * when it is the protocol acting on both. Nothing crosses between the lanes —
 * there is no event that could, which is the mechanism, not the layout.
 */
const SCRIPT: Record<
  string,
  { lane: Lane; kind: Beat["kind"]; label: string; note: string }
> = {
  ClaimSubmitted: {
    lane: "claimant",
    kind: "claim",
    label: "Claim submitted, bond escrowed",
    note: "The claimant states a figure it derived from an indexer and stakes ETH on it. The call takes a subject and a commitment; there is no parameter for a witness.",
  },
  WitnessAssigned: {
    lane: "spine",
    kind: "draw",
    label: "VRF drew the witness",
    note: "Chainlink returns a random word and the roster walks from it to the first eligible agent that is not the claimant.",
  },
  VerdictRecorded: {
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
    lane: "spine",
    kind: "panel",
    label: "VRF seated a panel of three",
    note: "A second draw, excluding the claimant, the original witness and the appellant. A panel containing any of them would not be review.",
  },
  PanelUpheld: {
    lane: "spine",
    kind: "panel",
    label: "Panel upheld the verdict",
    note: "Three independently seated agents reached the same finding as the first witness.",
  },
  PanelOverturned: {
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

function buildBeats(claim: ClaimRow, roster: Agent[]): Beat[] {
  const ordered = [...claim.events].sort(
    (a, b) =>
      Number(a.block - b.block) ||
      (ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99),
  );
  let previous = ordered[0]?.timestamp ?? 0;

  return ordered.map((e, i) => {
    const spec = SCRIPT[e.name] ?? {
      lane: "spine" as Lane,
      kind: "settle" as Beat["kind"],
      label: e.name,
      note: "",
    };
    const gap = Math.max(0, e.timestamp - previous);
    previous = e.timestamp;

    let detail = "";
    if (e.name === "WitnessAssigned") detail = nameOf(roster, String(e.args.witness));
    else if (e.name === "PanelSeated") {
      detail = (e.args.panel as string[]).map((a) => nameOf(roster, a)).join(", ");
    } else if (e.name === "VerdictRecorded") detail = VERDICT[Number(e.args.verdict)] ?? "";
    else if (e.name === "ClaimSubmitted") detail = nameOf(roster, String(e.args.claimant));

    return {
      key: `${e.name}-${e.tx}-${i}`,
      lane: spec.lane,
      kind: spec.kind,
      label: spec.label,
      detail,
      note: spec.note,
      tx: e.tx,
      block: String(e.block),
      gap,
    };
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

function buildSeal(claim: ClaimRow): Seal | null {
  const recorded = claim.events.find((e) => e.name === "VerdictRecorded");
  if (!recorded) return null;
  const assigned = claim.events.find((e) => e.name === "WitnessAssigned");

  const commitment = String(recorded.args.evidenceCommitment ?? "");

  return {
    tx: recorded.tx,
    block: String(recorded.block),
    verdict: (VERDICT[Number(recorded.args.verdict)] ?? "None") as VerdictName,
    commitment: commitment || null,
    adjudicationSeconds: assigned ? Math.max(0, recorded.timestamp - assigned.timestamp) : 0,
    withheld: [...WITHHELD],
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
