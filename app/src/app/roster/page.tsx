import { buildFleet, type FleetAgent } from "@/lib/fleet";
import { claimEvents, mechanismEvents, ago, EXPLORER, eth, short } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import { ensUrl } from "@/lib/identity";

export const revalidate = 30;

/**
 * The fleet as a registry rather than a leaderboard.
 *
 * A ranked list answers "who is best". The protocol never asks that. It asks
 * "who may be drawn", which is a boolean, and then "why not" for everyone else —
 * so the status is the first column and the reason travels with it.
 *
 * The standing bar is drawn against a domain that always contains zero, so the
 * sign of a score is visible rather than implied. There is deliberately no
 * threshold line on it: `WitnessRoster.isEligible` does not test the standing
 * value, and drawing one would show a mechanism the contract does not have.
 */
function StandingBar({ value, domain }: { value: number; domain: { lo: number; hi: number } }) {
  const span = domain.hi - domain.lo || 1;
  const at = (v: number) => ((v - domain.lo) / span) * 100;
  const zero = at(0);
  const head = at(value);

  return (
    <span className="fleet-bar" role="img" aria-label={`standing ${value}`}>
      <span className="fleet-bar-zero" style={{ left: `${zero}%` }} />
      <span
        className="fleet-bar-fill"
        data-down={value < 0}
        style={{ left: `${Math.min(zero, head)}%`, width: `${Math.abs(head - zero)}%` }}
      />
    </span>
  );
}

/**
 * Strikes as marks rather than a number.
 *
 * A strike is a standing write that went down — the tribunal marking this agent
 * down, counted from the write itself. Five slots, because more than five would
 * stop being countable at a glance and the count is printed anyway.
 */
function Strikes({ n }: { n: number }) {
  return (
    <span className="fleet-strikes" role="img" aria-label={n === 1 ? "1 strike" : `${n} strikes`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} data-on={i < n} />
      ))}
      {n > 5 && <b>+{n - 5}</b>}
    </span>
  );
}

/**
 * The same record, fetched the way a third party would fetch it.
 *
 * Three states rather than a tick: it resolves and agrees, it resolves and
 * disagrees, or the name does not resolve publicly at all. The last one is the
 * failure this project actually shipped for a week without noticing, so it gets
 * said in words.
 */
function UniversalResolverCheck({
  ours,
  resolver,
  theirs,
}: {
  ours: number;
  resolver: string | null;
  theirs: number | null;
}) {
  if (!resolver) {
    return (
      <span className="fleet-ur" data-state="absent" title="The ENS registry gives a third party no resolver for this name">
        does not resolve publicly
      </span>
    );
  }
  if (theirs === null) {
    return (
      <span className="fleet-ur" data-state="ok" title={`Resolves through the ENS Universal Resolver to ${resolver}. No standing record has been written, because this agent has never been judged.`}>
        resolves publicly · never judged
      </span>
    );
  }
  if (theirs !== ours) {
    return (
      <span className="fleet-ur" data-state="differs" title="Our reader and the Universal Resolver disagree about this record">
        Universal Resolver says {theirs > 0 ? `+${theirs}` : theirs}
      </span>
    );
  }
  return (
    <span className="fleet-ur" data-state="ok" title={`Resolved through the ENS Universal Resolver by ENSIP-10, with no resolver address supplied. It found ${resolver}.`}>
      resolves publicly · agrees
    </span>
  );
}

function Row({ a, domain }: { a: FleetAgent; domain: { lo: number; hi: number } }) {
  return (
    <div className="fleet-row" data-eligible={a.eligible}>
      <div className="fleet-agent">
        <span
          className="fleet-mono"
          style={{ ["--agent-hue" as string]: String(a.who.hue) }}
          aria-hidden="true"
        >
          {a.who.monogram}
        </span>
        <span>
          {/* The name goes to ENS, the address to Etherscan. They are two
              different identities and conflating them was the old behaviour. */}
          <a className="fleet-name" href={ensUrl(a.who.name)} target="_blank" rel="noreferrer">
            {a.who.name}
          </a>
          <a className="fleet-addr" href={`${EXPLORER}/address/${a.who.address}`}>
            {short(a.who.address, 10)}
          </a>
          {/*
            Proof the name is public, not just readable by us. This number came
            back from the ENS Universal Resolver walking the registry, with no
            resolver address supplied — the same path a wallet or an explorer
            takes. When it disagrees with the protocol's own reader, that is the
            interesting fact on this page and it is not smoothed over.
          */}
          <UniversalResolverCheck ours={a.standing} resolver={a.publicResolver} theirs={a.publicStanding} />
        </span>
      </div>

      <div className="fleet-status">
        <span className="fleet-chip" data-eligible={a.eligible}>
          {a.eligible ? "drawable" : "excluded"}
        </span>
        {a.exclusion && <span className="fleet-why">{a.exclusion}</span>}
      </div>

      <div className="fleet-standing">
        <StandingBar value={a.standing} domain={domain} />
        <b data-down={a.standing < 0}>{a.standing > 0 ? `+${a.standing}` : a.standing}</b>
      </div>

      <div className="fleet-strikes-cell">
        <Strikes n={a.strikes} />
      </div>

      <div className="fleet-last">
        {a.lastAction ? (
          <a href={`${EXPLORER}/tx/${a.lastAction.tx}`}>
            {a.lastAction.label}
            {a.lastAction.claimId && ` · claim ${a.lastAction.claimId}`}
            <span className="fleet-when">{ago(a.lastAction.timestamp)}</span>
          </a>
        ) : (
          <span className="muted">never drawn, never claimed</span>
        )}
      </div>
    </div>
  );
}

export default async function Roster() {
  const [roster, claims, mechanism] = await Promise.all([
    rosterSnapshot(),
    claimEvents(),
    mechanismEvents(),
  ]);
  const fleet = buildFleet(roster, claims, mechanism);

  // Excluded first: the interesting agent on this page is the one that cannot be
  // drawn, and burying it under the healthy ones is how a registry hides its
  // only news.
  const ordered = [...fleet.agents].sort((a, b) => Number(a.eligible) - Number(b.eligible));

  return (
    <main className="wrap section">
      <p className="eyebrow">Roster</p>
      <h1 className="h2" style={{ maxWidth: "18ch" }}>Who is allowed to judge.</h1>
      <p className="lede" style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>
        Every agent is a subname of <span className="mono">perjury.eth</span>, and its standing is a
        text record on that name. Eligibility is read from ENS at the moment a witness is drawn, not
        from a cache and not from anything this site controls.
      </p>

      <div className="assertions fleet-stats">
        <div className="assertion">
          <span className="k">Agents</span>
          <span className="v">{fleet.agents.length}</span>
          <span className="n">subnames of perjury.eth</span>
        </div>
        <div className="assertion">
          <span className="k">Drawable now</span>
          <span className="v">{fleet.drawable}</span>
          <span className="n">read from ENS, not cached</span>
        </div>
        <div className="assertion">
          <span className="k">Claims judged</span>
          <span className="v">{fleet.judged}</span>
          <span className="n">verdicts on chain</span>
        </div>
        <div className="assertion">
          <span className="k">Stakes slashed</span>
          <span className="v">{fleet.slashings}</span>
          <span className="n">forfeited to nobody</span>
        </div>
      </div>

      {fleet.agents.length === 0 ? (
        <p className="note" style={{ marginTop: "2rem" }}>
          No agents registered on this deployment yet.
        </p>
      ) : (
        <div className="fleet" role="table" aria-label="Agent registry">
          <div className="fleet-head" role="row" aria-hidden="true">
            <span>Agent</span>
            <span>Status</span>
            <span>Standing</span>
            <span>Strikes seen</span>
            <span>Last action</span>
          </div>
          {ordered.map((a) => (
            <Row key={a.who.address} a={a} domain={fleet.domain} />
          ))}
        </div>
      )}

      <p className="note" style={{ marginTop: "1.8rem" }}>
        Only the tribunal contract can write these scores. The operator wallet that deployed every
        contract and owns <span className="mono">perjury.eth</span> is refused by ENS access control
        when it tries. There is no owner, pause or upgrade path anywhere in the protocol to route
        around that.
      </p>

      <p className="note">
        Standing does not itself decide eligibility. <span className="mono">isEligible</span> tests
        the cooldown flag, the stake floor, and whether the ENS record can be read at all — an
        unreadable record is ineligible, which is why a read failure cannot quietly become a pass.
        Standing is the permanent public history beside it.
      </p>

      {/*
        Said plainly rather than left for a reader to work out from a standing of
        -6 sitting beside an empty row of strike marks.
      */}
      <p className="note">
        Standing is the lifetime record, read from ENS — it survived three
        redeployments of the contracts. <b>Strikes and last action are not</b>: they are counted from
        events{fleet.fromBlock ? ` since block ${Number(fleet.fromBlock).toLocaleString("en")}` : ""},
        so an agent can carry a low standing and show no strikes because the writes that earned it
        are older than the window.
      </p>

      <p className="note">
        Every name on this page is read twice. Once through the protocol's own reader contract, which
        is what actually decides eligibility, and once through the ENS Universal Resolver by ENSIP-10,
        which is what a wallet or a block explorer would do. The second read is the one that matters
        for trusting the first: our reader has the resolver address compiled into it, so it would keep
        answering for a name that had quietly stopped existing in ENS — which is exactly what happened
        here before <span className="mono">perjury.eth</span> had a subname registry. Both numbers are
        shown, and a disagreement is printed rather than resolved in our favour.
      </p>

      <p className="note">
        Total stake at risk across the fleet:{" "}
        <b>{eth(fleet.agents.reduce((sum, a) => sum + a.stake, 0n))} ETH</b>.
      </p>
    </main>
  );
}
