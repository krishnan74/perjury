/**
 * The agent fleet, as the protocol sees it.
 *
 * The roster page listed a name, a stake and a number. That answers "who exists"
 * and not the two questions anyone actually has: can this agent be drawn right
 * now, and what has it done. Both are on chain — the roster contract for the
 * first, the event stream for the second — and neither was being read.
 *
 * Every figure here is counted from events rather than asserted. A strike is a
 * standing write that went down, not an inference from a verdict; a witness
 * count is the number of times VRF actually drew this agent. The zeroes matter
 * as much as the totals: an agent that has never been drawn should look like one.
 */
import type { ClaimEvent } from "./perjury";
import { identityOf, type Identity } from "./identity";
import type { Agent } from "./roster";

export interface FleetAction {
  label: string;
  claimId: string | null;
  tx: string;
  timestamp: number;
}

export interface FleetAgent {
  who: Identity;
  standing: number;
  standingReadable: boolean;
  eligible: boolean;
  stake: bigint;
  registeredAt: number;
  /** Why the roster will not draw it, in the roster's own terms. Null when it will. */
  exclusion: string | null;
  claims: number;
  witnessed: number;
  paneled: number;
  /**
   * Standing writes that went down, WITHIN THE INDEXED WINDOW.
   *
   * Not a lifetime count, and the page must not imply one. Standing itself is
   * the lifetime record — it lives in ENS and survived three redeployments —
   * but the events it was written by are only read back over the recent block
   * range, so an agent can carry a standing of -6 and show no strikes here
   * because both writes happened before the window starts.
   */
  strikes: number;
  lastAction: FleetAction | null;
}

export interface Fleet {
  agents: FleetAgent[];
  drawable: number;
  /** Claims that reached a verdict, across the whole roster. */
  judged: number;
  /** Times any agent lost its stake. */
  slashings: number;
  /** The range the standing bars are drawn against. */
  domain: { lo: number; hi: number };
  /** Oldest block the activity columns can see. Everything before it is invisible. */
  fromBlock: string | null;
}

/**
 * Why the roster will not draw this agent.
 *
 * Deliberately not "standing fell below the threshold". `WitnessRoster` has no
 * such test — it gates on the cooldown flag, the stake floor, and whether the
 * ENS record can be read at all. Gating on the standing value was removed on
 * purpose because it made exclusion permanent and unrecoverable. This page said
 * otherwise for weeks, which described a mechanism the contract does not have.
 */
function exclusionReason(a: Agent): string | null {
  if (a.eligible) return null;
  if (!a.standingReadable) return "ENS record unreadable — eligibility fails closed";
  if (a.stake === 0n) return "stake slashed to zero — flagged until it tops up";
  if (a.flaggedUntil > Date.now() / 1000) return "serving the mismatch cooldown";
  return "not eligible";
}

/**
 * Event names in the reader's language.
 *
 * Both streams are here, because the roster and the registry emit the same
 * moment under different names — `WitnessAssigned` and `WitnessDrawn` are one
 * draw. A name missing from this map used to fall through and print itself, so
 * the page showed "PanelDrawn" to a reader who has never read the contracts.
 */
const ACTION: Record<string, string> = {
  ClaimSubmitted: "made a claim",
  WitnessAssigned: "drawn as witness",
  WitnessDrawn: "drawn as witness",
  WitnessRequested: "a draw was requested",
  PanelSeated: "seated on a panel",
  PanelDrawn: "seated on a panel",
  Appealed: "appealed",
  VerdictRecorded: "judged",
  PanelUpheld: "its panel upheld the verdict",
  PanelOverturned: "its panel overturned the verdict",
  Settled: "settled",
  ClaimantSlashed: "slashed for a false claim",
  WitnessPaid: "paid its fee",
  AgentSlashed: "stake slashed",
  AgentToppedUp: "topped its stake back up",
  AgentFlagged: "flagged",
  AgentRegistered: "registered",
  StandingUpdated: "standing rewritten",
  NoEligibleWitness: "no eligible witness",
};

/** Every event that names this address, whichever field it appears in. */
function concerns(e: ClaimEvent, address: string): boolean {
  const a = address.toLowerCase();
  for (const [key, value] of Object.entries(e.args)) {
    if (key === "claimId") continue;
    if (typeof value === "string" && value.toLowerCase() === a) return true;
    if (Array.isArray(value) && value.some((v) => String(v).toLowerCase() === a)) return true;
  }
  return false;
}

export function buildFleet(roster: Agent[], claims: ClaimEvent[], mechanism: ClaimEvent[]): Fleet {
  const all = [...claims, ...mechanism].sort((a, b) => a.timestamp - b.timestamp);

  const agents: FleetAgent[] = roster.map((a) => {
    const mine = all.filter((e) => concerns(e, a.address));
    const node = a.ensNode.toLowerCase();

    // A strike is a standing write that went down. Counted from the write
    // itself rather than inferred from a verdict, so an appeal that overturned
    // a finding never leaves a mark the record does not have.
    const strikes = mechanism.filter(
      (e) =>
        e.name === "StandingUpdated" &&
        String(e.args.node).toLowerCase() === node &&
        Number(e.args.newStanding) < Number(e.args.oldStanding),
    ).length;

    const last = mine[mine.length - 1];

    return {
      who: identityOf(a.name, a.address, "protocol"),
      standing: a.standing,
      standingReadable: a.standingReadable,
      eligible: a.eligible,
      stake: a.stake,
      registeredAt: a.registeredAt,
      exclusion: exclusionReason(a),
      claims: mine.filter((e) => e.name === "ClaimSubmitted").length,
      witnessed: mine.filter((e) => e.name === "WitnessAssigned").length,
      paneled: mine.filter((e) => e.name === "PanelSeated").length,
      strikes,
      lastAction: last
        ? {
            label: ACTION[last.name] ?? last.name,
            claimId: last.claimId === "-" ? null : last.claimId,
            tx: last.tx,
            timestamp: last.timestamp,
          }
        : null,
    };
  });

  // Zero is always in the domain, so the sign of a standing is visible rather
  // than implied, and a roster that happens to be all-positive still shows the
  // floor everyone started from.
  const values = agents.map((a) => a.standing);
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);

  const blocks = all.map((e) => e.block);

  return {
    agents,
    fromBlock: blocks.length ? String(blocks.reduce((m, b) => (b < m ? b : m))) : null,
    drawable: agents.filter((a) => a.eligible).length,
    judged: claims.filter((e) => e.name === "VerdictRecorded").length,
    slashings: mechanism.filter((e) => e.name === "AgentSlashed").length,
    domain: { lo, hi },
  };
}
