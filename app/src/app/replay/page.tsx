import { claimEvents, claimsIndex, short } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import Replay, { type Step } from "./Replay";

export const revalidate = 30;

const LABEL: Record<string, string> = {
  ClaimSubmitted: "Claim submitted, bond escrowed",
  WitnessAssigned: "VRF drew the witness",
  VerdictRecorded: "Tribunal returned a verdict",
  Appealed: "Claimant appealed, appeal bond posted",
  PanelSeated: "VRF seated a panel of three",
  PanelUpheld: "Panel upheld the verdict",
  PanelOverturned: "Panel overturned the verdict",
  ClaimantSlashed: "Claimant slashed",
  WitnessPaid: "Witness paid its flat fee",
  Settled: "Settled",
};

export default async function ReplayPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const { claim: requested } = await searchParams;
  const [events, roster] = await Promise.all([claimEvents(), rosterSnapshot()]);
  const rows = claimsIndex(events);

  const name = (addr: string) =>
    roster.find((a) => a.address.toLowerCase() === addr.toLowerCase())?.name ?? short(addr, 8);

  // Default to the richest completed claim — the one that was appealed, since it
  // exercises every stage the protocol has.
  const settled = rows.filter((r) => r.status === "Settled");
  const chosen =
    rows.find((r) => r.id === requested) ??
    settled.find((r) => r.appealed) ??
    settled[0] ??
    rows[0];

  if (!chosen) {
    return (
      <main className="wrap section">
        <p className="eyebrow">Replay</p>
        <h1 className="h2">No settled claims in range.</h1>
      </main>
    );
  }

  let previous = chosen.events[0]?.timestamp ?? 0;
  const steps: Step[] = chosen.events.map((e) => {
    const gap = Math.max(0, e.timestamp - previous);
    previous = e.timestamp;
    return {
      label: LABEL[e.name] ?? e.name,
      detail:
        e.name === "WitnessAssigned"
          ? name(String(e.args.witness))
          : e.name === "PanelSeated"
            ? (e.args.panel as string[]).map(name).join(", ")
            : "",
      tx: e.tx,
      gap,
    };
  });

  return (
    <main className="wrap section">
      <p className="eyebrow">Replay</p>
      <h1 className="h2" style={{ maxWidth: "22ch" }}>Watch a claim settle.</h1>
      <p className="lede" style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>
        This is claim #{chosen.id} played back from its own transactions — every hash below is real and
        every gap is what actually elapsed. Running it live takes minutes, most of it waiting for VRF
        and for the challenge window to close, so the playback compresses the waiting and nothing else.
      </p>

      <Replay steps={steps} claimId={chosen.id} />

      <p className="eyebrow" style={{ marginTop: "3rem" }}>Replay another</p>
      <div className="actions" style={{ marginTop: "0.6rem" }}>
        {settled.slice(0, 6).map((r) => (
          <a
            key={r.id}
            className="btn ghost"
            href={`/replay?claim=${r.id}`}
            style={{ opacity: r.id === chosen.id ? 0.45 : 1 }}
          >
            #{r.id} · {r.verdict}
            {r.appealed ? " · appealed" : ""}
          </a>
        ))}
      </div>
    </main>
  );
}
