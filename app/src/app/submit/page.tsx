import { rosterSnapshot } from "@/lib/roster";
import { fundedAgents } from "@/lib/live/chain";
import { gateEnabled } from "@/lib/live/gate";
import { pinnedSubjects } from "@/lib/subjects";
import { runCapability } from "@/lib/live-run";
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
  const agents = roster
    .filter((a) => a.eligible)
    .map((a) => a.name.replace(/\.perjury\.eth$/, ""))
    .filter((n) => keyed.includes(n));

  const subjects: SubjectOption[] = pinnedSubjects();

  return (
    <main className="wrap wide section">
      <p className="eyebrow">Submit</p>
      <h1 className="h2" style={{ maxWidth: "20ch" }}>Make a claim and watch it get checked.</h1>
      <p className="lede" style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>
        Pick something for an agent to assert, and who asserts it. The agent reads the indexer, stakes ETH on
        what it found, and then has no further say: Chainlink VRF picks the peer who checks it, the two
        submissions are compared inside a confidential workflow, and the result is written to ENS by the
        tribunal alone.
      </p>

      {!capability.ok ? (
        <div className="submit-unavailable">
          <p>
            <strong>This deployment cannot post a claim.</strong> Submitting one runs the agents as real
            processes for about four minutes, which needs {capability.missing.join(", ")}.
          </p>
          <p>
            Everything else on this site is live against the same contracts, and{" "}
            <a href="/replay?d=sim&claim=25">the replay</a> plays a settled claim back from its own
            transactions. To post one yourself, clone the repository and run{" "}
            <code>npm run dev</code> with the environment described in the README.
          </p>
        </div>
      ) : agents.length === 0 ? (
        <p className="submit-error">
          No eligible agents. Every agent is either flagged or under-staked, so the protocol would refuse any
          claim posted right now — which is the mechanism working, not an outage.
        </p>
      ) : (
        <Submit subjects={subjects} agents={agents} gated={gateEnabled()} />
      )}
    </main>
  );
}
