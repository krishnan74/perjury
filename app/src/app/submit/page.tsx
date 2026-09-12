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
      <p className="lede" style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>
        An agent is about to state a fact and put money behind it. You choose which fact and which
        agent; after that it has no say in anything. A peer it cannot pick is drawn to answer the same
        question alone, the two answers are compared where neither can see, and the result is written
        to the agent&rsquo;s ENS name by the tribunal and nobody else.
      </p>

      {/*
        What pressing the button actually costs and does, before it is pressed.
        A page that spends real money on a stranger's click owes them this in
        plain terms rather than in a tooltip.
      */}
      <div className="submit-brief">
        <p>
          <b>This is not a simulation.</b> A bond of {"0.010"} ETH leaves a funded wallet, Chainlink VRF
          runs a real draw, the confidential workflow adjudicates in an enclave on the Chainlink DON, and
          the claim settles on Sepolia. It takes roughly four to six minutes, and most of that is waiting
          — about a minute for VRF to fulfil and ninety seconds of challenge window during which the
          verdict can still be appealed.
        </p>
        <p>
          <b>You are watching it, not driving it.</b> Below the picker is the same view as{" "}
          <a href="/replay">the replay</a>, built from the same transactions, filling in as they land.
          The one thing you decide is the claim; everything after the bond is the protocol.
        </p>
      </div>

      {/*
        Open, with a cap. ETHGlobal's guidance is explicit that making a project
        harder for partners to try costs more than it protects, so the shared
        password is off in this deployment and the paid model key is bounded by
        a per-day budget instead. When the budget is spent the page says so and
        says when it returns, which is a better answer than a login box.

        What is deliberately NOT shown is which credential a deployment is
        missing, if any. Telling a stranger exactly what is unconfigured is a
        small leak and a free one to close.
      */}
      {today.limit > 0 && (
        <p className={today.remaining > 0 ? "note" : "submit-unavailable-note"}>
          {today.remaining > 0 ? (
            <>
              Anyone can run this, no password. Every run pays for a model call and real gas, so it is
              capped at {today.limit} claims a day rather than gated —{" "}
              <b>{today.remaining} left today</b>, resetting at 00:00 UTC.
            </>
          ) : (
            <>
              Today&apos;s {today.limit} live claims are spent, and the budget resets at 00:00 UTC. Every
              claim already settled is still replayable from its own transactions, and every proof in the
              repo still runs.
            </>
          )}
        </p>
      )}
      {!capability.ok && (
        <p className="submit-unavailable-note">
          Live submission is not currently available on this deployment. Everything else here is live
          against the same contracts, and <a href="/replay?d=sim&claim=25">the replay</a> plays a settled
          claim back from its own transactions.
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
