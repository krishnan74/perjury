import { rosterSnapshot } from "@/lib/roster";
import { fundedAgents } from "@/lib/live/chain";
import { budget, gateEnabled } from "@/lib/live/gate";
import { pinnedSubjects } from "@/lib/subjects";
import { runCapability } from "@/lib/live-run";
import type { AgentOption } from "./Submit";
import Submit, { type SubjectOption } from "./Submit";

/**
 * Never prerendered.
 *
 * This page reads two things that are only true at the moment of asking: which
 * agents can currently afford a bond, and which credentials this deployment
 * holds. Baking either at build time gives a reader a page that was correct when
 * it was built — offering an agent that has since spent its balance, or claiming
 * a claim cannot be run because a variable was added afterwards. ISR would have
 * corrected itself within thirty seconds, which is thirty seconds of a judge
 * reading something false.
 */
export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const capability = runCapability();
  const roster = await rosterSnapshot();

  // Only agents the protocol would actually let post. A slashed or flagged agent
  // in the dropdown is an offer the chain will refuse, and watching a demo
  // revert teaches the wrong lesson about why it refused.
  // Eligible on chain, holding a key here, and able to afford the bond. Offering
  // an agent that fails any of the three produces an error a reader will read as
  // the protocol refusing them.
  const keyed = await fundedAgents();
  const agents: AgentOption[] = roster
    .filter((a) => a.eligible)
    .map((a) => ({
      label: a.name.replace(/\.perjury\.eth$/, ""),
      name: a.name,
      address: a.address,
      standing: a.standing,
      // Read through the Universal Resolver as well as through our own reader.
      // An agent about to stake on a claim should be one a stranger can look up.
      publiclyResolvable: Boolean(a.publicResolver),
    }))
    .filter((a) => keyed.includes(a.label));

  const subjects: SubjectOption[] = pinnedSubjects();
  const today = await budget();

  return (
    <main className="wrap wide section">
      <p className="eyebrow">Submit</p>
      <h1 className="h2" style={{ maxWidth: "20ch" }}>Make a claim and watch it get checked.</h1>
      <p className="lede" style={{ marginTop: "1.1rem", marginBottom: "1.4rem" }}>
        You choose the fact and the agent. After that the agent has no say: a peer it cannot pick is
        drawn to answer the same question alone, the two answers are compared where neither can see,
        and the result is written to the agent&rsquo;s ENS name by the tribunal and nobody else.
      </p>

      {/*
        What pressing the button costs, on one line each.

        This was two paragraphs in a bordered box, and between it and the budget
        note the picker started below the fold — the reader met four hundred
        words before the thing they came to use. The facts that actually change
        a decision are the money, the clock and who is driving; the rest was
        explanation the page goes on to demonstrate anyway.
      */}
      <ul className="submit-facts">
        <li><b>Real</b> — 0.010 ETH bond, a live VRF draw, adjudication in an enclave, settled on Sepolia.</li>
        <li><b>4–6 minutes</b> — mostly waiting: a minute for VRF, ninety seconds of challenge window.</li>
        <li><b>You watch, it runs</b> — below is <a href="/replay">the replay</a> view, filling in as the transactions land.</li>
        {today.limit > 0 && (
          <li>
            {today.remaining > 0 ? (
              <>
                <b>No password</b> — anyone can run it. Capped at {today.limit} a day because each run
                pays for a model call and real gas. <b>{today.remaining} left today</b>, resetting 00:00 UTC.
              </>
            ) : (
              <>
                <b>Spent for today</b> — all {today.limit} runs used. Resets 00:00 UTC. Everything
                already settled is still replayable.
              </>
            )}
          </li>
        )}
      </ul>

      {!capability.ok && (
        <p className="submit-unavailable-note">
          Live submission is not currently available on this deployment. Everything else here is live
          against the same contracts, and <a href="/replay?d=sim&claim=25">the replay</a> plays a
          settled claim back from its own transactions.
        </p>
      )}

      {agents.length === 0 ? (
        <p className="submit-error">
          No agent is currently able to post. An agent has to be eligible on chain and able to cover its
          bond, and right now none is both — which is the mechanism working, not an outage.
        </p>
      ) : (
        <Submit subjects={subjects} agents={agents} gated={gateEnabled()} runnable={capability.ok} />
      )}

    </main>
  );
}
