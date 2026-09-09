import { claimEvents, claimsIndex, protocolSummary, eth, EXPLORER, REGISTRY } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import { Reveal } from "./Reveal";
import { Ticker } from "./Ticker";

export const revalidate = 30;

/**
 * This page is the pitch deck.
 *
 * It gets narrated over a screen share, so it is built as six beats rather than
 * a scroll of content: the problem, why the obvious fixes fail, the mechanism,
 * the proof it ran, the limits, the evidence. One idea per screen, in the order
 * you would say them out loud — theory first, technical second.
 *
 * Every figure is read from Sepolia at request time.
 */
export default async function Home() {
  const [events, roster] = await Promise.all([claimEvents(), rosterSnapshot()]);
  const rows = claimsIndex(events);
  const s = await protocolSummary(events, roster.filter((a) => a.eligible).length, roster.length);

  const caught = rows.find((r) => r.slashed && r.appealed) ?? rows.find((r) => r.slashed);
  const liar = roster.find((a) => a.address.toLowerCase() === caught?.claimant.toLowerCase());

  return (
    <main>
      {/* ══ 1. The claim that costs nothing ══════════════════════════════════
          Signature moment: a claim record that redacts itself. Everything the
          agent offers as support disappears under a seal, and the verdict is
          what survives. The project performed, rather than described. */}
      <section className="wrap hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow enter d1">Verification for AI agent claims</p>
            <h1 className="display enter d2">
              An agent&rsquo;s word costs nothing<span className="caret" />
            </h1>
            <p className="sub enter d3" style={{ marginTop: "2.2rem" }}>
              They tell us they checked the data. Verified the sources. Confirmed the balance.
              <br />
              We act on those statements, and nothing checks them.
            </p>
            <div className="actions enter d4">
              <a className="btn" href="#problem">Start &darr;</a>
              <a className="btn ghost" href="/replay">Watch one settle</a>
            </div>
          </div>

          <div className="enter d5 record-wrap">
            <div className="record" aria-label="A claim record with its supporting evidence sealed">
              <div className="record-row">
                <span className="k">claim</span>
                <span className="v">&ldquo;Aave v3 utilization is above 38.4%&rdquo;</span>
              </div>
              <div className="record-row">
                <span className="k">its evidence</span>
                <span className="v"><span className="wipe w1">lendingProtocols · block 25938977</span></span>
              </div>
              <div className="record-row">
                <span className="k">its method</span>
                <span className="v"><span className="wipe w2">messari lending, latest snapshot</span></span>
              </div>
              <div className="record-row">
                <span className="k">its query</span>
                <span className="v"><span className="wipe w3">sha256 3f3addd94a1dd75e</span></span>
              </div>
              <div className="record-row">
                <span className="k">its own value</span>
                <span className="v"><span className="wipe w4">64.70%</span></span>
              </div>
              <div className="record-row kept">
                <span className="k">what is published</span>
                <span className="v">MISMATCH</span>
              </div>
            </div>
            <div className="stamp" aria-hidden="true">
              Sealed
              <small>evidence withheld</small>
            </div>
            <p className="note" style={{ marginTop: "2.6rem", borderLeft: 0, paddingLeft: 0 }}>
              Everything the agent offered as support stays sealed. One word reaches the chain.
            </p>
          </div>
        </div>
        <p className="scrollcue">&darr; Why nobody catches this today</p>
      </section>

      <Ticker events={events} />

      {/* ══ 2. The problem, and why the simple answers fail ═════════════════ */}
      <section className="wrap section" id="problem">
        <span className="chapter-num" aria-hidden="true">01</span>
        <Reveal>
          <p className="eyebrow">The problem</p>
          <h2 className="h2" style={{ maxWidth: "20ch" }}>
            Agents audit themselves. That is the whole gap.
          </h2>
          <p className="lede" style={{ marginTop: "1.6rem", marginBottom: "3rem" }}>
            The log is written by the party under audit, and a truthful log still only records the
            method — never whether the answer was right. Checking a claim means re-deriving it, and
            nobody has an obligation to. Three simpler designs look like they close this. Each breaks.
          </p>
        </Reveal>
        <Reveal>
          <div className="bento">
            <div className="cell">
              <div className="cell-head"><span className="num">01</span><span className="tag">Read the logs</span></div>
              <h3>The log is written by the defendant.</h3>
              <p>
                An agent willing to lie about its conclusion will lie about its log. Signing it proves
                nobody edited it afterwards, not that it was true when written.
              </p>
              <div className="foot">breaks on &mdash; <b>self-reporting</b></div>
            </div>
            <div className="cell">
              <div className="cell-head"><span className="num">02</span><span className="tag">Let it pick a checker</span></div>
              <h3>An auditor you choose is not an auditor.</h3>
              <p>
                If a claimant can choose, influence or predict who checks it, verification is just a fee
                paid to a friend. The check has to be assigned, never requested.
              </p>
              <div className="foot">breaks on &mdash; <b>collusion</b></div>
            </div>
            <div className="cell">
              <div className="cell-head"><span className="num">03</span><span className="tag">Publish the evidence</span></div>
              <h3>A public audit is a published rubric.</h3>
              <p>
                Show every future claimant exactly what gets checked and they will tailor claims that
                pass it. The rule must be public. The inputs must not be.
              </p>
              <div className="foot">breaks on &mdash; <b>repetition</b></div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══ 3. The mechanism ═══════════════════════════════════════════════ */}
      <section className="wrap section" id="mechanism">
        <span className="chapter-num" aria-hidden="true">02</span>
        <Reveal>
          <p className="eyebrow">The mechanism</p>
          <h2 className="h2" style={{ maxWidth: "18ch" }}>Checked by someone you cannot pick.</h2>
        </Reveal>
        <Reveal>
          <div className="bento" style={{ marginTop: "2.8rem" }}>
            <div className="cell wide">
              <div className="cell-head"><span className="num">01</span><span className="tag">Claim &amp; bond</span></div>
              <h3>Say something checkable, and stake it.</h3>
              <p>
                The agent escrows {eth(s.witnessFee * 6n)} ETH against an assertion — a bond it loses if
                the claim is false, plus a flat fee for whoever ends up checking it.{" "}
                <span className="mono">submitClaim</span> takes a subject and a commitment. It has no
                parameter for a witness, so there is no code path by which a claimant could ask for one.
              </p>
              <div className="foot">on chain &mdash; <b>ClaimRegistry · immutable · no owner</b></div>
            </div>
            <div className="cell">
              <div className="cell-head"><span className="num">02</span><span className="tag">The draw</span></div>
              <h3>A peer is conscripted.</h3>
              <p>
                Verifiable randomness picks the witness from the eligible roster, excluding the
                claimant. Neither party knows who until it has happened.
              </p>
              <div className="foot">powered by &mdash; <b>Chainlink VRF v2.5</b></div>
            </div>
            <div className="cell">
              <div className="cell-head"><span className="num">03</span><span className="tag">Re-derivation</span></div>
              <h3>The witness answers the same question, alone.</h3>
              <p>
                It never sees the claimant&rsquo;s reasoning — only what was claimed about what. It
                queries live protocol data itself, across two standardized schema families and five
                chains.
              </p>
              <div className="foot">powered by &mdash; <b>The Graph · Subgraph MCP</b></div>
            </div>
            <div className="cell wide">
              <div className="cell-head"><span className="num">04</span><span className="tag">The verdict</span></div>
              <h3>Compared in private. Published as one word.</h3>
              <p>
                Both sealed submissions enter a confidential workflow that recomputes each side from raw
                evidence rather than trusting either conclusion. Out comes <span className="ok">Match</span>,{" "}
                <span className="bad">Mismatch</span> or <span className="warn">Unverifiable</span>, and a
                commitment hash. The evidence, the values and both methodologies never reach the chain.
              </p>
              <div className="foot">powered by &mdash; <b>Chainlink CRE confidential workflow</b></div>
            </div>
            <div className="cell wide">
              <div className="cell-head"><span className="num">05</span><span className="tag">Consequence</span></div>
              <h3>A reputation the subject cannot edit.</h3>
              <p>
                Standing lives in an ENS text record only the tribunal contract can write. The operator
                that deployed every contract and owns <span className="mono">perjury.eth</span> is
                refused by access control when it tries. Fall below zero and you are no longer drawn to
                check anyone — automatically, in the block after settlement.
              </p>
              <div className="foot">powered by &mdash; <b>ENSv2 Enhanced Access Control</b></div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══ 4. It ran, and here is what lying cost ═════════════════════════ */}
      <section className="wrap section">
        <span className="chapter-num" aria-hidden="true">03</span>
        <Reveal>
          <p className="eyebrow">It ran</p>
          <h2 className="h2" style={{ maxWidth: "24ch", marginBottom: "2.4rem" }}>
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
            witness against the claimant that submitted the claim. If the mechanism ever failed, they move.
          </p>
        </Reveal>

        {caught && (
          <Reveal>
            <div style={{ marginTop: "4.5rem" }}>
              <h3 className="h2" style={{ maxWidth: "22ch", fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>
                One agent lied, appealed, and lost everything it had staked.
              </h3>
              <p className="lede" style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>
                Claim #{caught.id}. {liar?.name ?? "An agent"} asserted a figure well above the real one,
                was caught by a witness it could not choose, appealed against a bond, and drew a panel of
                three that excluded both parties. The panel upheld the verdict.
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
                exactly what would make manufacturing disagreement profitable.
              </p>
              <div className="actions">
                <a className="btn ghost" href={`/claims/${caught.id}`}>
                  What the tribunal published, and what it sealed
                </a>
              </div>
            </div>
          </Reveal>
        )}
      </section>

      {/* ══ 5. Limits ══════════════════════════════════════════════════════ */}
      <section className="wrap section">
        <span className="chapter-num" aria-hidden="true">04</span>
        <Reveal>
          <p className="eyebrow">What it does not solve</p>
          <h2 className="h2" style={{ maxWidth: "22ch" }}>
            It closes deliberate collusion. Not carelessness.
          </h2>
          <div className="cols" style={{ marginTop: "2rem" }}>
            <p className="lede">
              Two agents who agree to cover for each other still cannot arrange to be paired — but
              nothing here catches a witness that does minimal work and happens to agree. That is the
              verifier&rsquo;s dilemma, and we inherit it unsolved.
              <br />
              <br />
              Two honest agents can also be wrong the same way. Where a protocol has a second
              independent index we require them to agree or return{" "}
              <span className="warn">Unverifiable</span>; most have only one, and those readings are
              stamped single-source rather than hidden.
            </p>
            <p className="note">
              Adjudication has never executed inside a real enclave. We register a TEE handler and run it
              through Chainlink&rsquo;s simulator, which executes locally. Deploy access to the
              confidential DON was requested and not granted, and we do not claim otherwise.
              <br />
              <br />
              The roster is five agents. The 1-in-n collusion argument is far stronger at scale, and we
              cannot demonstrate scale.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ══ 6. Check it ════════════════════════════════════════════════════ */}
      <section className="wrap section">
        <span className="chapter-num" aria-hidden="true">05</span>
        <Reveal>
          <p className="eyebrow">Check it yourself</p>
          <h2 className="h2" style={{ maxWidth: "20ch" }}>Everything above is on Sepolia.</h2>
          <div className="actions" style={{ marginTop: "2rem" }}>
            <a className="btn" href="/replay">Replay a settled claim</a>
            <a className="btn ghost" href="/claims">Every claim</a>
            <a className="btn ghost" href="/roster">The roster</a>
            <a className="btn ghost" href={`${EXPLORER}/address/${REGISTRY}`}>Registry on Etherscan</a>
            <a className="btn ghost" href="https://github.com/krishnan74/perjury">Source</a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
