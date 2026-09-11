import { rosterSnapshot } from "@/lib/roster";
import { pinnedSubjects } from "@/lib/subjects";
import Submit, { type SubjectOption } from "./Submit";

export const revalidate = 30;

export default async function SubmitPage() {
  const roster = await rosterSnapshot();

  // Only agents the protocol would actually let post. A slashed or flagged agent
  // in the dropdown is an offer the chain will refuse, and watching a demo
  // revert teaches the wrong lesson about why it refused.
  const agents = roster
    .filter((a) => a.eligible)
    .map((a) => a.name.replace(/\.perjury\.eth$/, ""))
    .filter((n) => ["operator", "witness-a", "panel-1", "panel-2", "panel-3"].includes(n));

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

      {agents.length === 0 ? (
        <p className="submit-error">
          No eligible agents. Every agent is either flagged or under-staked, so the protocol would refuse any
          claim posted right now — which is the mechanism working, not an outage.
        </p>
      ) : (
        <Submit subjects={subjects} agents={agents} />
      )}
    </main>
  );
}
