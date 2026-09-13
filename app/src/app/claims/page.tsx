import { claimEvents, claimsIndex, eth, ago, short } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import { DEPLOYMENTS } from "@/lib/deployments";

/**
 * Rendered per request, not prebuilt.
 *
 * This reads three cascades' full event logs and three rosters in parallel —
 * three times what any other page here asks of the RPC in one render. Baking
 * that into the build meant `next build` itself depended on a free public RPC
 * answering a burst of ~200 eth_getLogs calls without timing out, which is a
 * bet this page should not be making. Rendered on request instead, same as
 * /submit: the per-span retry in `collect()` already covers a transient node
 * hiccup, and there is no static shell worth pre-baking for a page with no
 * params.
 */
export const dynamic = "force-dynamic";

/**
 * Every claim the protocol has ever settled, across every cascade it has run
 * on, as one list rather than a filtered view.
 *
 * A claim's id restarts at one with each redeployment, so three separate
 * registries each hold a "#1". Reading only the current one hid the appeal
 * this project is built around, and reading one at a time behind a switcher
 * made a reader pick a cascade before they even knew which one had it. Neither
 * problem exists once every cascade is read and shown together — each row
 * still carries which deployment it belongs to, it is just not a filter
 * anyone has to operate first.
 */
export default async function Claims() {
  const perDeployment = await Promise.all(
    DEPLOYMENTS.map(async (deployment) => {
      const [events, roster] = await Promise.all([
        claimEvents(undefined, deployment),
        rosterSnapshot(deployment),
      ]);
      return { deployment, rows: claimsIndex(events), roster };
    }),
  );

  const total = perDeployment.reduce((sum, d) => sum + d.rows.length, 0);

  return (
    <main className="wrap section">
      <p className="eyebrow">Claims</p>
      <h1 className="h2" style={{ maxWidth: "20ch" }}>Every claim, and how it ended.</h1>
      <p className="lede" style={{ marginTop: "1.2rem" }}>
        Read from the event logs of every cascade this protocol has run on &mdash; ids restart at one
        with each redeployment, so an id alone never identifies a claim, only a claim plus its
        cascade. {total} claims total. Click one to watch it settle from its own transactions.
      </p>

      {total === 0 && (
        <p className="note" style={{ marginTop: "2.4rem" }}>
          No claims in the block range this page reads. The registries are live either way &mdash;
          check them directly on Etherscan.
        </p>
      )}

      <div style={{ marginTop: "2.4rem" }}>
        {perDeployment.map(({ deployment, rows, roster }) =>
          rows.map((r) => {
            const name = (addr: string | null) =>
              roster.find((a) => a.address.toLowerCase() === (addr ?? "").toLowerCase())?.name ??
              short(addr ?? "—", 8);
            const href = deployment.current
              ? `/replay?claim=${r.id}`
              : `/replay?claim=${r.id}&d=${deployment.id}`;
            return (
              <a className="row" key={`${deployment.id}-${r.id}`} href={href}>
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
                    {!deployment.current && <span>{deployment.label}</span>}
                  </div>
                </div>
                <div className="right">
                  <span className={`verdict v-${r.verdict}`}>{r.verdict === "None" ? "pending" : r.verdict}</span>
                </div>
              </a>
            );
          }),
        )}
      </div>

      <p className="note" style={{ marginTop: "2rem" }}>
        Claims with no verdict are collusion probes: the third demo scene submits a run of claims only
        to record who the draw lands on, and never adjudicates them.
      </p>
    </main>
  );
}
