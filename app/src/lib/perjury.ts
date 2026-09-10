/**
 * Read-only view of the live protocol.
 *
 * Everything here runs on the server. There is no wallet, no signer, and no
 * write path anywhere in this file — the dashboard cannot change protocol state,
 * which is what lets it be public without a gate. `GRAPH_STUDIO_KEY` and the RPC
 * URL are read from the environment here and never reach the client bundle.
 */
import { createPublicClient, http, parseAbiItem, type AbiEvent, type Address, type Log } from "viem";
import { sepolia } from "viem/chains";

export const EXPLORER = "https://sepolia.etherscan.io";

export const REGISTRY = process.env.CLAIM_REGISTRY_ADDRESS as Address;
export const ROSTER = process.env.WITNESS_ROSTER_ADDRESS as Address;
export const SINK = process.env.VERDICT_SINK_ADDRESS as Address;
export const RESOLVER = process.env.PERJURY_RESOLVER_ADDRESS as Address;
export const WRITER = process.env.STANDING_WRITER_ADDRESS as Address;

/**
 * Batching matters here. A page render makes dozens of small reads — ten log
 * queries, a timestamp per block, four calls per agent — and unbatched those are
 * dozens of round trips. Batching collapses them into a handful of JSON-RPC
 * payloads and roughly halves the render.
 */
export const pub = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL, { batch: { wait: 12 } }),
  batch: { multicall: { wait: 12 } },
});

/** Mirrors the on-chain enums so a number never reaches a template. */
export const STATUS = ["None", "Pending", "WitnessAssigned", "Adjudicated", "UnderAppeal", "Settled"] as const;
export const VERDICT = ["None", "Match", "Mismatch", "Unverifiable"] as const;
export type VerdictName = (typeof VERDICT)[number];

const CLAIM_TUPLE = {
  components: [
    { name: "claimant", type: "address" },
    { name: "witness", type: "address" },
    { name: "subject", type: "bytes32" },
    { name: "claimHash", type: "bytes32" },
    { name: "evidenceCommitment", type: "bytes32" },
    { name: "bond", type: "uint256" },
    { name: "submittedAt", type: "uint64" },
    { name: "assignedAt", type: "uint64" },
    { name: "status", type: "uint8" },
    { name: "verdict", type: "uint8" },
  ],
  type: "tuple",
} as const;

export const REGISTRY_ABI = [
  { type: "function", name: "nextClaimId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimOf", stateMutability: "view", inputs: [{ name: "claimId", type: "uint256" }], outputs: [CLAIM_TUPLE] },
  {
    type: "function", name: "appealOf", stateMutability: "view", inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [{
      components: [
        { name: "appellant", type: "address" },
        { name: "bond", type: "uint256" },
        { name: "panel", type: "address[]" },
        { name: "original", type: "uint8" },
        { name: "open", type: "bool" },
      ],
      type: "tuple",
    }],
  },
  { type: "function", name: "challengeDeadline", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "forfeited", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MIN_BOND", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "WITNESS_FEE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "APPEAL_BOND", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "CHALLENGE_WINDOW", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
] as const;

export const ROSTER_ABI = [
  { type: "function", name: "agentCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "agentList", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isEligible", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "stakeOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "flaggedUntil", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "REGISTRATION_STAKE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "PANEL_SIZE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "agents", stateMutability: "view", inputs: [{ type: "address" }],
    outputs: [
      { name: "ensNode", type: "bytes32" },
      { name: "dnsName", type: "bytes" },
      { name: "active", type: "bool" },
      { name: "registeredAt", type: "uint64" },
      { name: "stake", type: "uint256" },
    ],
  },
] as const;

export const READER_ABI = [
  {
    type: "function", name: "standingOfNameChecked", stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "bytes" }],
    outputs: [{ name: "standing", type: "int256" }, { name: "readable", type: "bool" }],
  },
] as const;

/**
 * How far back the dashboard looks.
 *
 * Sepolia runs a block every twelve seconds, so this is about a day. The
 * previous 2500 was eight hours, which quietly emptied every page whenever the
 * scenes had not been re-run since breakfast — `/replay` rendered "no settled
 * claims in range" against a chain that had eleven of them. Overridable so a
 * deployment can widen it without a code change.
 */
export const LOOKBACK = BigInt(process.env.CHAIN_LOOKBACK_BLOCKS ?? 7200);

/** Public RPCs cap `eth_getLogs` spans. Well under the common 10k limit. */
const CHUNK = 5000n;

/** The events that make up a claim's life, in the order they can occur. */
export const CLAIM_EVENTS = [
  parseAbiItem("event ClaimSubmitted(uint256 indexed claimId, address indexed claimant, bytes32 subject, uint256 bond)"),
  parseAbiItem("event WitnessAssigned(uint256 indexed claimId, address indexed witness)"),
  parseAbiItem("event VerdictRecorded(uint256 indexed claimId, uint8 verdict, bytes32 evidenceCommitment)"),
  parseAbiItem("event Appealed(uint256 indexed claimId, address indexed appellant, uint256 bond)"),
  parseAbiItem("event PanelSeated(uint256 indexed claimId, address[] panel)"),
  parseAbiItem("event PanelUpheld(uint256 indexed claimId, uint8 verdict)"),
  parseAbiItem("event PanelOverturned(uint256 indexed claimId, uint8 original, uint8 panel, address contradicted, uint256 slashed)"),
  parseAbiItem("event Settled(uint256 indexed claimId, address indexed claimant, uint8 verdict)"),
  parseAbiItem("event ClaimantSlashed(uint256 indexed claimId, address indexed claimant, uint256 bond, uint256 stakeSlashed)"),
  parseAbiItem("event WitnessPaid(uint256 indexed claimId, address indexed witness, uint256 fee)"),
] as const;

/**
 * The mechanism underneath the claim lifecycle.
 *
 * `ClaimRegistry` says a witness was assigned; the roster says which VRF request
 * produced that assignment and on what seed, which is the difference between
 * asserting the draw was random and showing it. `PerjuryStandingWriter` carries
 * the before and after of every reputation write, so the ENS consequence is read
 * from the chain rather than recomputed from the verdict.
 */
export const ROSTER_EVENTS = [
  parseAbiItem("event WitnessRequested(uint256 indexed claimId, uint256 indexed requestId)"),
  parseAbiItem("event WitnessDrawn(uint256 indexed claimId, address indexed witness, uint256 seed)"),
  parseAbiItem("event NoEligibleWitness(uint256 indexed claimId)"),
  parseAbiItem("event PanelRequested(uint256 indexed claimId, uint256 indexed requestId)"),
  parseAbiItem("event PanelDrawn(uint256 indexed claimId, address[] panel)"),
  parseAbiItem("event AgentFlagged(address indexed agent, uint64 until)"),
  parseAbiItem("event AgentSlashed(address indexed agent, uint256 amount, uint256 remainingStake)"),
] as const;

export const WRITER_EVENTS = [
  parseAbiItem("event StandingUpdated(bytes32 indexed node, int256 oldStanding, int256 newStanding)"),
] as const;

export interface ClaimEvent {
  name: string;
  claimId: string;
  block: bigint;
  timestamp: number;
  tx: `0x${string}`;
  args: Record<string, unknown>;
}

/**
 * Every protocol event in a window, ordered as they happened.
 *
 * The dashboard derives everything from these rather than from a database. It is
 * slower, and it means the page can only show what actually happened on chain —
 * which for a project about verifiable claims is the right constraint to accept.
 */
export async function claimEvents(lookback = LOOKBACK): Promise<ClaimEvent[]> {
  return collect([[REGISTRY, CLAIM_EVENTS]], lookback);
}

/**
 * Roster and standing-writer events over the same window.
 *
 * Kept separate from `claimEvents` on purpose. `claimsIndex` folds its input by
 * claim id, and roster events also carry a claim id — merging the two streams
 * would push `WitnessRequested` into every claim's stage list on pages that only
 * ever meant to show the lifecycle.
 */
export async function mechanismEvents(lookback = LOOKBACK): Promise<ClaimEvent[]> {
  return collect(
    [
      [ROSTER, ROSTER_EVENTS],
      [WRITER, WRITER_EVENTS],
    ],
    lookback,
  );
}

/** Read several contracts' logs over one window and stamp them with block times. */
async function collect(
  sources: readonly (readonly [Address, readonly AbiEvent[]])[],
  lookback: bigint,
): Promise<ClaimEvent[]> {
  const head = await pub.getBlockNumber();
  const fromBlock = head > lookback ? head - lookback : 0n;

  // Spans wider than the provider's cap fail whole, not partially, so the window
  // is split before it is asked for rather than after it errors.
  const spans: [bigint, bigint][] = [];
  for (let from = fromBlock; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n;
    spans.push([from, to > head ? head : to]);
  }

  const batches = await Promise.all(
    sources.flatMap(([address, events]) =>
      events.flatMap((event) =>
        spans.map(
          ([from, to]): Promise<Log[]> =>
            pub.getLogs({ address, event, fromBlock: from, toBlock: to }).catch(() => []),
        ),
      ),
    ),
  );

  const logs = batches.flat();
  // One timestamp lookup per block rather than per event.
  const blocks = [...new Set(logs.map((l) => l.blockNumber!))];
  const times = new Map<bigint, number>();
  await Promise.all(
    blocks.map(async (b) => {
      const blk = await pub.getBlock({ blockNumber: b });
      times.set(b, Number(blk.timestamp));
    }),
  );

  return logs
    .map((l) => {
      const args = (l as unknown as { args: Record<string, unknown> }).args ?? {};
      return {
        name: (l as unknown as { eventName: string }).eventName,
        claimId: args.claimId !== undefined ? String(args.claimId) : "-",
        block: l.blockNumber!,
        timestamp: times.get(l.blockNumber!) ?? 0,
        tx: l.transactionHash!,
        args,
      };
    })
    .sort((a, b) => Number(a.block - b.block) || a.name.localeCompare(b.name));
}

export const short = (a: string, n = 6) => `${a.slice(0, n)}…${a.slice(-4)}`;

/** ETH amounts via Intl so grouping and decimals follow the locale. */
export function eth(wei: bigint, dp = 3): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: dp }).format(Number(wei) / 1e18);
}

/** Relative time via Intl, so the wording follows the reader's locale. */
const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

export function ago(ts: number, now = Date.now()): string {
  const d = Math.max(0, Math.floor(now / 1000) - ts);
  if (d < 60) return RELATIVE.format(-d, "second");
  if (d < 3600) return RELATIVE.format(-Math.floor(d / 60), "minute");
  if (d < 86400) return RELATIVE.format(-Math.floor(d / 3600), "hour");
  return RELATIVE.format(-Math.floor(d / 86400), "day");
}

export interface Summary {
  claimsSubmitted: number;
  claimsAdjudicated: number;
  /** Claims where the drawn witness was the claimant. Structurally impossible. */
  selfWitnessed: number;
  /** Wei of forfeited bond that reached a witness. Witnesses get a flat fee only. */
  bondToWitness: bigint;
  witnessFeesPaid: bigint;
  witnessFee: bigint;
  forfeited: bigint;
  agentsEligible: number;
  agentsTotal: number;
}

/**
 * The figures the landing page asserts.
 *
 * Deliberately not a volume dashboard. Perjury's interesting numbers are the
 * zeros — a claimant has never witnessed its own claim, and no forfeited bond
 * has ever reached a witness — so each is COUNTED from chain rather than
 * asserted in prose. A zero that was computed is evidence; a zero in a sentence
 * is a promise.
 */
export async function protocolSummary(events: ClaimEvent[], eligible: number, total: number): Promise<Summary> {
  const submitted = events.filter((e) => e.name === "ClaimSubmitted");
  const verdicts = events.filter((e) => e.name === "VerdictRecorded");
  const assigned = events.filter((e) => e.name === "WitnessAssigned");
  const paid = events.filter((e) => e.name === "WitnessPaid");

  const claimantOf = new Map(submitted.map((e) => [e.claimId, String(e.args.claimant).toLowerCase()]));
  const selfWitnessed = assigned.filter(
    (e) => claimantOf.get(e.claimId) === String(e.args.witness).toLowerCase(),
  ).length;

  const [witnessFee, forfeited] = await Promise.all([
    pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "WITNESS_FEE" }),
    pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "forfeited" }),
  ]);

  const witnessFeesPaid = paid.reduce((acc, e) => acc + BigInt(String(e.args.fee ?? 0n)), 0n);
  // Anything a witness received beyond the flat fee would be bond value. There is
  // no code path that does this; the figure is computed rather than trusted.
  const bondToWitness = witnessFeesPaid - witnessFee * BigInt(paid.length);

  return {
    claimsSubmitted: submitted.length,
    claimsAdjudicated: verdicts.length,
    selfWitnessed,
    bondToWitness: bondToWitness > 0n ? bondToWitness : 0n,
    witnessFeesPaid,
    witnessFee,
    forfeited,
    agentsEligible: eligible,
    agentsTotal: total,
  };
}

export interface ClaimRow {
  id: string;
  claimant: string;
  witness: string | null;
  bond: bigint;
  verdict: VerdictName;
  status: (typeof STATUS)[number];
  appealed: boolean;
  panel: string[];
  submittedAt: number;
  settledAt: number | null;
  slashed: boolean;
  events: ClaimEvent[];
}

/** Fold the event stream into one row per claim, newest first. */
export function claimsIndex(events: ClaimEvent[]): ClaimRow[] {
  const byId = new Map<string, ClaimEvent[]>();
  for (const e of events) {
    if (e.claimId === "-") continue;
    byId.set(e.claimId, [...(byId.get(e.claimId) ?? []), e]);
  }

  const rows: ClaimRow[] = [];
  for (const [id, evs] of byId) {
    const find = (n: string) => evs.find((e) => e.name === n);
    const submitted = find("ClaimSubmitted");
    const assigned = find("WitnessAssigned");
    const verdictEv = find("PanelUpheld") ?? find("PanelOverturned") ?? find("VerdictRecorded");
    const settled = find("Settled");

    // A panel verdict supersedes the original — the appeal is the final word.
    const raw = verdictEv
      ? Number(verdictEv.args.verdict ?? verdictEv.args.panel ?? 0)
      : 0;

    rows.push({
      id,
      claimant: String(submitted?.args.claimant ?? ""),
      witness: assigned ? String(assigned.args.witness) : null,
      bond: BigInt(String(submitted?.args.bond ?? 0n)),
      verdict: (VERDICT[raw] ?? "None") as VerdictName,
      status: settled ? "Settled" : verdictEv ? "Adjudicated" : assigned ? "WitnessAssigned" : "Pending",
      appealed: Boolean(find("Appealed")),
      panel: (find("PanelSeated")?.args.panel as string[] | undefined) ?? [],
      submittedAt: submitted?.timestamp ?? 0,
      settledAt: settled?.timestamp ?? null,
      slashed: Boolean(find("ClaimantSlashed")),
      events: evs,
    });
  }
  return rows.sort((a, b) => Number(b.id) - Number(a.id));
}
