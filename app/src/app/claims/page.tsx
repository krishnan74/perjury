import { claimEvents, claimsAreWhole, claimsIndex, eth, ago, short } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import { DEPLOYMENTS, deploymentById } from "@/lib/deployments";

export const revalidate = 30;

export default async function Claims({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  // Claim ids restart at one with every cascade, so a feed showing only the
  // current contracts silently hides every claim that settled before the last
  // redeploy — including the appeal this project is built around. The set being
  // read is named on the page rather than assumed.
  const { d } = await searchParams;
  const deployment = deploymentById(d);
  const [events, roster] = await Promise.all([
    claimEvents(undefined, deployment),
    rosterSnapshot(deployment),
  ]);
  const rows = claimsIndex(events);
  const completeness = await claimsAreWhole(rows, deployment);
  const name = (addr: string | null) =>
    roster.find((a) => a.address.toLowerCase() === (addr ?? "").toLowerCase())?.name ?? short(addr ?? "—", 8);

  return (
    <main className="wrap section">
      <p className="eyebrow">Claims</p>
      <h1 className="h2" style={{ maxWidth: "20ch" }}>Every claim, and how it ended.</h1>
      <p className="lede" style={{ marginTop: "1.2rem" }}>
        Read from the registry&rsquo;s event log. Each row links to what the tribunal published — and,
        more usefully, to what it did not.
      </p>

      <div className="deployment-switch">
        {DEPLOYMENTS.map((dep) => (
          <a
            key={dep.id}
            href={dep.current ? "/claims" : `/claims?d=${dep.id}`}
            aria-current={dep.id === deployment.id ? "page" : undefined}
          >
            {dep.label}
          </a>
        ))}
      </div>
      <p className="note" style={{ marginTop: "0.9rem", maxWidth: "70ch" }}>{deployment.note}</p>

      {!completeness.whole && (
        <p className="submit-error" style={{ marginTop: "1.6rem" }}>
          Showing {completeness.read} of {completeness.expected} claims. The rest are on chain; this page
          could not read them, because the node answered a wide log query with a truncated set rather than an
          error. Nothing is missing from the registry, only from this view.
        </p>
      )}

      {rows.length === 0 && (
        <p className="note" style={{ marginTop: "2.4rem" }}>
          No claims in the block range this page reads. The registry is live either way — check it
          directly on Etherscan.
        </p>
      )}

      <div style={{ marginTop: "2.4rem" }}>
        {rows.map((r) => (
          <a
            className="row"
            key={r.id}
            href={deployment.current ? `/claims/${r.id}` : `/claims/${r.id}?d=${deployment.id}`}
          >
            <span className="idx">#{r.id}</span>
            <div>
              <div className="title">
                {name(r.claimant)} <span className="muted">&rarr;</span>{" "}
                {r.witness ? name(r.witness) : <span className="muted">awaiting draw</span>}
              </div>
              <div className="meta">
                <span>bond {eth(r.bond)} ETH</span>
                <span>{r.status}</span>
                {r.appealed && <span>appealed &middot; panel of {r.panel.length}</span>}
                {r.slashed && <span className="flag">claimant slashed</span>}
                <span>{ago(r.settledAt ?? r.submittedAt)}</span>
              </div>
            </div>
            <div className="right">
              <span className={`verdict v-${r.verdict}`}>{r.verdict === "None" ? "pending" : r.verdict}</span>
            </div>
          </a>
        ))}
      </div>

      <p className="note" style={{ marginTop: "2rem" }}>
        Claims with no verdict are collusion probes: the third scene submits a run of claims only to
        record who the draw lands on, and never adjudicates them.
      </p>
    </main>
  );
}
