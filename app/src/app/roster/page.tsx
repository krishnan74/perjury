import { rosterSnapshot, type Agent } from "@/lib/roster";
import { EXPLORER, eth, short } from "@/lib/perjury";

export const revalidate = 30;

/**
 * Why this is grouped rather than ranked.
 *
 * A leaderboard answers "who is best". The protocol never asks that — it asks
 * "who may be drawn", which is a boolean, and then "why not" for everyone else.
 * Ranking five agents by score would invent a hierarchy the mechanism does not
 * use and bury the only fact that matters.
 */
function reasonExcluded(a: Agent): string {
  if (!a.standingReadable) return "ENS record unreadable — fails closed";
  if (a.standing < 0) return `standing ${a.standing} — slashed for a false claim`;
  if (a.stake === 0n) return "stake forfeited";
  if (a.flaggedUntil > Date.now() / 1000) return "flagged, cooling down";
  return "below the eligibility threshold";
}

function Row({ a, i }: { a: Agent; i: number }) {
  return (
    <div className="row">
      <span className="idx">{String(i + 1).padStart(2, "0")}</span>
      <div>
        <div className="title">{a.name}</div>
        <div className="meta">
          <a href={`${EXPLORER}/address/${a.address}`} style={{ color: "inherit" }}>{short(a.address, 10)}</a>
          <span>stake {eth(a.stake)} ETH</span>
          {!a.eligible && <span className="flag">{reasonExcluded(a)}</span>}
        </div>
      </div>
      <div className="right">
        <div className="figure">{a.standing > 0 ? `+${a.standing}` : a.standing}</div>
        <div className="figure-note">{a.eligible ? "eligible" : "excluded"}</div>
      </div>
    </div>
  );
}

export default async function Roster() {
  const agents = await rosterSnapshot();
  const eligible = agents.filter((a) => a.eligible);
  const excluded = agents.filter((a) => !a.eligible);

  return (
    <main className="wrap section">
      <p className="eyebrow">Roster</p>
      <h1 className="h2" style={{ maxWidth: "18ch" }}>Who is allowed to judge.</h1>
      <p className="lede" style={{ marginTop: "1.2rem" }}>
        Every agent here is a subname of <span className="mono">perjury.eth</span>, and its standing is
        a text record on that name. Eligibility is read from ENS at the moment a witness is drawn — not
        from a cache, and not from anything this site controls.
      </p>

      <p className="note" style={{ margin: "1.6rem 0 2.4rem" }}>
        Only the tribunal contract can write these scores. The operator wallet that deployed every
        contract and owns <span className="mono">perjury.eth</span> is refused by ENS access control
        when it tries — the restriction is a permission, not a policy, and there is no owner, pause or
        upgrade path anywhere in the protocol to route around it.
      </p>

      {agents.length === 0 && (
        <p className="note">No agents registered on this deployment yet.</p>
      )}

      <p className="eyebrow">Eligible — {eligible.length} of {agents.length}</p>
      <div>{eligible.map((a, i) => <Row key={a.address} a={a} i={i} />)}</div>

      {excluded.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: "3rem" }}>Excluded — and why</p>
          <div>{excluded.map((a, i) => <Row key={a.address} a={a} i={eligible.length + i} />)}</div>
          <p className="note" style={{ marginTop: "1.6rem" }}>
            An excluded agent cannot witness for anyone. Nobody removed it — its standing fell below the
            threshold when a claim it made was found false, and the roster read that from ENS on the
            next draw. Exclusion happened in the block after settlement, with no operator involved.
          </p>
        </>
      )}
    </main>
  );
}
