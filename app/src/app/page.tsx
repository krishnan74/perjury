import { claimEvents, claimsIndex, protocolSummary, eth, EXPLORER, REGISTRY } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";

export const revalidate = 30;

/**
 * This page is the pitch.
 *
 * There is no slide deck behind this project, so the landing page has to do the
 * explaining a deck would: state the gap, rule out the obvious fixes, walk the
 * mechanism, prove it ran, and say what it does not solve. It is longer than a
 * marketing page on purpose, and every figure in it is read from Sepolia.
 */
export default async function Home() {
  const [events, roster] = await Promise.all([claimEvents(), rosterSnapshot()]);
  const rows = claimsIndex(events);
  const s = await protocolSummary(events, roster.filter((a) => a.eligible).length, roster.length);

  // The worked example: a real claim that was caught, appealed, and upheld.
  const caught = rows.find((r) => r.slashed && r.appealed) ?? rows.find((r) => r.slashed);
  const liar = roster.find((a) => a.address.toLowerCase() === caught?.claimant.toLowerCase());

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="wrap hero">
        <p className="eyebrow">Verification for AI agent claims</p>
        <h1 className="display">
          An agent&rsquo;s word
          <br />
          costs nothing<span className="caret" />
        </h1>
        <p className="sub" style={{ marginTop: "2rem" }}>
          Agents tell us they checked the data, verified the sources, confirmed the balance.
          <br />
          We act on those statements. Nothing checks them.
          <br />
          Perjury makes being wrong cost something.
        </p>
        <div className="actions">
          <a className="btn" href="/replay">Watch a claim settle &rarr;</a>
          <a className="btn ghost" href="#mechanism">How it works</a>
        </div>
        <p className="eyebrow" style={{ marginTop: "3.5rem", marginBottom: "0.7rem" }}>Built on</p>
        <p className="mono small muted" style={{ margin: 0, letterSpacing: "0.06em" }}>
          CHAINLINK CRE &nbsp;·&nbsp; CHAINLINK VRF &nbsp;·&nbsp; ENS &nbsp;·&nbsp; THE GRAPH
        </p>
        <p className="scrollcue">&darr; The gap this closes</p>
      </section>

      {/* ── The gap ──────────────────────────────────────────────────────── */}
      <section className="wrap section">
        <p className="eyebrow">The gap</p>
        <h2 className="h2" style={{ maxWidth: "24ch" }}>
          Agents report on their own work. Nobody audits the report.
        </h2>
        <div className="cols" style={{ marginTop: "2.4rem", alignItems: "start" }}>
          <p className="lede">
            When an agent says <em>&ldquo;I verified the collateral before routing your funds&rdquo;</em>,
            that sentence is free to produce and free to fabricate. The log it writes is written by the
            party under audit. Signing it proves nobody edited it afterwards — not that it was true when
            written.
            <br />
            <br />
            And a truthful log still only tells you the method. It cannot tell you the answer was right.
            Verifying a claim means re-deriving it, which nobody has an obligation to do.
          </p>
          <div className="seal-panel">
            <div className="k">what the agent tells you</div>
            <div className="out">&ldquo;Aave v3 utilization is above 38.4%.&rdquo;</div>
            <div className="k" style={{ marginTop: "1.4rem" }}>what you can check</div>
            <div>
              <span className="bar" style={{ ["--w" as string]: "26ch" }} />
            </div>
            <div>
              <span className="bar" style={{ ["--w" as string]: "18ch" }} />
            </div>
            <div>
              <span className="bar" style={{ ["--w" as string]: "22ch" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Why the obvious fixes fail ───────────────────────────────────── */}
      <section className="wrap section">
        <p className="eyebrow">Why the obvious fixes fail</p>
        <h2 className="h2" style={{ maxWidth: "26ch" }}>
          Three simpler designs, and what breaks each one.
        </h2>
        <div className="bento" style={{ marginTop: "2.6rem" }}>
          <div className="cell">
            <div className="cell-head"><span className="num">01</span><span className="tag">Just read the logs</span></div>
            <h3>The log is written by the defendant.</h3>
            <p>
              An agent willing to lie about its conclusion will lie about its log. And an honest log
              records the <em>method</em>, never whether the answer was correct.
            </p>
            <div className="foot">breaks on — <b>self-reporting</b></div>
          </div>
          <div className="cell">
            <div className="cell-head"><span className="num">02</span><span className="tag">Let it choose a checker</span></div>
            <h3>An auditor you pick is not an auditor.</h3>
            <p>
              If a claimant can choose, influence or predict who checks it, verification becomes a fee
              paid to a friend. The check has to be assigned, not requested.
            </p>
            <div className="foot">breaks on — <b>collusion</b></div>
          </div>
          <div className="cell">
            <div className="cell-head"><span className="num">03</span><span className="tag">Publish the evidence</span></div>
            <h3>A public audit is a published rubric.</h3>
            <p>
              Show every future claimant exactly what gets checked and they will tailor claims that
              pass it. The rule must be public; the inputs must not be.
            </p>
            <div className="foot">breaks on — <b>repetition</b></div>
          </div>
        </div>
      </section>

      {/* ── Mechanism ────────────────────────────────────────────────────── */}
      <section className="wrap section" id="mechanism">
        <p className="eyebrow">How it works</p>
        <h2 className="h2" style={{ maxWidth: "22ch" }}>Checked by someone you cannot pick.</h2>
        <div className="bento" style={{ marginTop: "2.6rem" }}>
          <div className="cell wide">
            <div className="cell-head"><span className="num">01</span><span className="tag">Claim &amp; bond</span></div>
            <h3>Say something checkable, and stake it.</h3>
            <p>
              The agent escrows {eth(s.witnessFee * 6n)} ETH against an assertion — a bond it loses if
              the claim is false, plus a flat fee for whoever ends up checking it.{" "}
              <span className="mono">submitClaim</span> takes a subject and a commitment. It has no
              parameter for a witness, so there is no code path by which a claimant could ask for one.
            </p>
            <div className="foot">on chain — <b>ClaimRegistry, immutable, no owner</b></div>
          </div>
          <div className="cell">
            <div className="cell-head"><span className="num">02</span><span className="tag">The draw</span></div>
            <h3>A peer is conscripted.</h3>
            <p>
              Verifiable randomness picks the witness from the eligible roster, excluding the claimant.
              Neither party knows who it will be until it has happened.
            </p>
            <div className="foot">powered by — <b>Chainlink VRF v2.5</b></div>
          </div>
          <div className="cell">
            <div className="cell-head"><span className="num">03</span><span className="tag">Re-derivation</span></div>
            <h3>The witness answers the same question, alone.</h3>
            <p>
              It never sees the claimant&rsquo;s reasoning — only what was claimed about what. It queries
              live protocol data itself, across two standardized schema families and five chains.
            </p>
            <div className="foot">powered by — <b>The Graph · Subgraph MCP</b></div>
          </div>
          <div className="cell wide">
            <div className="cell-head"><span className="num">04</span><span className="tag">The verdict</span></div>
            <h3>Compared in private. Published as one word.</h3>
            <p>
              Both sealed submissions enter a confidential workflow that recomputes each side from raw
              evidence rather than trusting either conclusion. Out comes{" "}
              <span className="ok">Match</span>, <span className="bad">Mismatch</span> or{" "}
              <span className="warn">Unverifiable</span> — and a commitment hash. The evidence, the
              values and both methodologies never reach the chain.
            </p>
            <div className="foot">powered by — <b>Chainlink CRE confidential workflow</b></div>
          </div>
          <div className="cell wide">
            <div className="cell-head"><span className="num">05</span><span className="tag">Consequence</span></div>
            <h3>A reputation the subject cannot edit.</h3>
            <p>
              Standing lives in an ENS text record only the tribunal contract can write. The operator
              that deployed every contract and owns <span className="mono">perjury.eth</span> is refused
              by access control when it tries. Fall below zero and you are no longer drawn to check
              anyone — automatically, in the block after settlement.
            </p>
            <div className="foot">powered by — <b>ENSv2 Enhanced Access Control</b></div>
          </div>
        </div>
      </section>

      {/* ── Counted, not claimed ─────────────────────────────────────────── */}
      <section className="wrap section">
        <p className="eyebrow">Counted from Sepolia, not claimed</p>
        <h2 className="h2" style={{ maxWidth: "26ch", marginBottom: "2rem" }}>
          The interesting numbers are the ones that stay at zero.
        </h2>
        <div className="assertions">
          <div className="assertion">
            <span className="k">Claims adjudicated</span>
            <span className="v">{s.claimsAdjudicated}</span>
            <span className="n">of {s.claimsSubmitted} submitted</span>
          </div>
          <div className="assertion">
            <span className="k">Claimants who checked their own claim</span>
            <span className="v">{s.selfWitnessed}</span>
            <span className="n">no witness parameter exists</span>
          </div>
          <div className="assertion">
            <span className="k">Forfeited bond paid to a witness</span>
            <span className="v">{eth(s.bondToWitness)}</span>
            <span className="n">ETH — a flat fee either way</span>
          </div>
          <div className="assertion">
            <span className="k">Agents eligible to judge</span>
            <span className="v">{s.agentsEligible}</span>
            <span className="n">of {s.agentsTotal} registered</span>
          </div>
        </div>
        <p className="note" style={{ marginTop: "1.3rem" }}>
          Both zeros are arithmetic over event logs, not sentences. The second compares every drawn
          witness against the claimant that submitted the claim; the third sums what witnesses were paid
          and subtracts the flat fee they were owed. If the mechanism ever failed, these move.
        </p>
        <p className="note" style={{ marginTop: "0.9rem" }}>
          Fewer claims are adjudicated than submitted because the collusion scene deliberately leaves
          its claims unadjudicated — it submits a run of them purely to record who the draw lands on.
          Those are probes, not failures.
        </p>
      </section>

      {/* ── What lying cost ──────────────────────────────────────────────── */}
      {caught && (
        <section className="wrap section">
          <p className="eyebrow">What one false claim cost</p>
          <h2 className="h2" style={{ maxWidth: "24ch" }}>
            It lied, appealed, and lost everything it had staked.
          </h2>
          <p className="lede" style={{ marginTop: "1.3rem", marginBottom: "2rem" }}>
            Claim #{caught.id}. {liar?.name ?? "An agent"} asserted a figure well above the real one, was
            caught by a witness it could not choose, appealed against a bond, drew a panel of three that
            excluded both parties — and the panel upheld the verdict.
          </p>
          <div className="ledger">
            <div className="ledger-row"><span>Bond, forfeited to nobody</span><span className="amt">&minus;0.01 ETH</span></div>
            <div className="ledger-row"><span>Appeal bond, forfeited on losing</span><span className="amt">&minus;0.02 ETH</span></div>
            <div className="ledger-row"><span>Registration stake, slashed</span><span className="amt">&minus;0.01 ETH</span></div>
            <div className="ledger-row"><span>ENS standing</span><span className="amt">&minus;6</span></div>
            <div className="ledger-row total"><span>Right to check anyone else</span><span className="amt">revoked</span></div>
          </div>
          <p className="note" style={{ marginTop: "1.4rem" }}>
            The forfeited ETH went to nobody — not the witness, not us. Paying it to the witness is
            exactly what would make manufacturing disagreement profitable, so the witness earns the same
            flat fee whether it finds a match or a mismatch.
          </p>
          <div className="actions">
            <a className="btn ghost" href={`/claims/${caught.id}`}>See what the tribunal published &mdash; and what it sealed</a>
          </div>
        </section>
      )}

      {/* ── Limits ───────────────────────────────────────────────────────── */}
      <section className="wrap section">
        <p className="eyebrow">What this does not solve</p>
        <h2 className="h2" style={{ maxWidth: "24ch" }}>
          It closes deliberate collusion. Not carelessness.
        </h2>
        <div className="cols" style={{ marginTop: "1.8rem" }}>
          <p className="lede">
            Two agents who agree to cover for each other still cannot arrange to be paired — but nothing
            here catches a witness that does minimal work and happens to agree. That is the verifier&rsquo;s
            dilemma and we inherit it unsolved.
            <br />
            <br />
            Two honest agents can also be wrong the same way. Where a protocol has a second independent
            index we require them to agree or return <span className="warn">Unverifiable</span>; most
            protocols have only one, and those readings are stamped single-source rather than hidden.
          </p>
          <p className="note">
            Adjudication has never executed inside a real enclave. We register a TEE handler and run it
            through Chainlink&rsquo;s simulator, which executes locally. Deploy access to the confidential
            DON was requested and not granted, and we do not claim otherwise.
            <br />
            <br />
            The roster is five agents. The 1-in-n collusion argument is much stronger at scale, and we
            cannot demonstrate scale.
          </p>
        </div>
      </section>

      {/* ── Go look ──────────────────────────────────────────────────────── */}
      <section className="wrap section">
        <p className="eyebrow">Check it yourself</p>
        <h2 className="h2" style={{ maxWidth: "22ch" }}>Everything above is on Sepolia.</h2>
        <div className="actions" style={{ marginTop: "1.8rem" }}>
          <a className="btn" href="/replay">Replay a settled claim</a>
          <a className="btn ghost" href="/claims">Every claim</a>
          <a className="btn ghost" href="/roster">The roster</a>
          <a className="btn ghost" href={`${EXPLORER}/address/${REGISTRY}`}>Registry on Etherscan</a>
          <a className="btn ghost" href="https://github.com/krishnan74/perjury">Source</a>
        </div>
      </section>
    </main>
  );
}
