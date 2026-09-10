import { REGISTRY, REGISTRY_ABI, claimEvents, claimsIndex, mechanismEvents, pub } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import { buildScript } from "@/lib/replay";
import { claimTextVerified, readArchive } from "@/lib/evidence";
import Replay from "./Replay";

export const revalidate = 30;

export default async function ReplayPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const { claim: requested } = await searchParams;
  const [events, mechanism, roster] = await Promise.all([
    claimEvents(),
    mechanismEvents(),
    rosterSnapshot(),
  ]);
  const rows = claimsIndex(events);

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

  // The archive is a record of a run, not a source of truth about the chain.
  // Everything it asserts that CAN be checked against chain is checked here.
  const archive = readArchive(chosen.id);
  // claimHash is storage, not an event field — ClaimSubmitted carries only the
  // subject and the bond — so it is read from the registry.
  const stored = await pub
    .readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "claimOf", args: [BigInt(chosen.id)] })
    .catch(() => null);
  const claimTextOk =
    archive && stored ? claimTextVerified(archive, stored.claimHash) : null;

  const script = buildScript(chosen, mechanism, roster, archive, claimTextOk);

  return (
    <main className="wrap section">
      <p className="eyebrow">Replay</p>
      <h1 className="h2" style={{ maxWidth: "22ch" }}>Watch a claim settle.</h1>
      <p className="lede" style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>
        This is claim #{script.claimId} played back from its own transactions — every hash below is real and
        every gap is what actually elapsed. Running it live takes minutes, most of it waiting for VRF
        and for the challenge window to close, so the playback compresses the waiting and nothing else.
      </p>

      {/*
        Stated before anything is played, not buried at the beat where it
        matters. A reader who sees two "sealed" values on screen should not have
        to scroll to find out why they can see them.
      */}
      {/*
        The spec's own rule: missing data says so. A claim with no archived
        bundle was rendering no read beats and no explanation, which is
        indistinguishable from a claim whose agents did no work.
      */}
      {!script.archive && (
        <p className="note demo-note">
          <b>No evidence archived for this claim.</b> It settled before the runner began keeping
          bundles, so the replay can show every transaction but not what either agent asked or
          concluded. Claims from #19 onward carry their evidence.
        </p>
      )}

      {script.archive && (
        <p className="note demo-note">
          <b>Testnet demo.</b> The agents&rsquo; queries and values are readable here because the
          runner keeps a local copy of each settled bundle. The evidence itself travels sealed: it is
          encrypted to a key the Chainlink Vault DON releases only into the enclave, so the gateway
          holds ciphertext and neither party ever sees the other&rsquo;s work. Verify it yourself with{" "}
          <span className="mono">npx tsx scripts/prove-sealed.ts</span>.
        </p>
      )}

      <Replay script={script} />

      <p className="eyebrow" style={{ marginTop: "3rem" }}>Replay another</p>
      <div className="actions" style={{ marginTop: "0.6rem" }}>
        {settled.slice(0, 6).map((r) => (
          <a
            key={r.id}
            className="btn ghost"
            href={`/replay?claim=${r.id}`}
            style={{ opacity: r.id === script.claimId ? 0.45 : 1 }}
          >
            #{r.id} · {r.verdict}
            {r.appealed ? " · appealed" : ""}
          </a>
        ))}
      </div>
    </main>
  );
}
