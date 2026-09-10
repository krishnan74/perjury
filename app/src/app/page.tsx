import { claimEvents, protocolSummary, eth, EXPLORER, REGISTRY } from "@/lib/perjury";
import { rosterSnapshot } from "@/lib/roster";
import { Reveal } from "./Reveal";
import { Ticker } from "./Ticker";
import { PartnerList } from "./Partners";

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
  const s = await protocolSummary(events, roster.filter((a) => a.eligible).length, roster.length);


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
              <div className="stamp" aria-hidden="true">
                Sealed
                <small>evidence withheld</small>
              </div>
            </div>
            <p className="note" style={{ marginTop: "3.2rem", borderLeft: 0, paddingLeft: 0 }}>
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
            You cannot tell if an agent is lying.
          </h2>
          <p className="lede" style={{ marginTop: "1.6rem", marginBottom: "1.4rem" }}>
            An AI agent tells you a number. It might have read it. It might have invented it. The only
            way to know is to do the work again yourself — which is the work you asked it to do.
          </p>
          <p className="lede" style={{ marginBottom: "3rem" }}>
            Logs do not help. The log is written by the party under audit, and even an honest log
            records the method, never whether the answer was right. Three obvious fixes look like they
            close this. Each one breaks.
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
          <h2 className="h2" style={{ maxWidth: "18ch" }}>Make it bet. Make someone else check.</h2>
          <p className="lede" style={{ marginTop: "1.6rem" }}>
            An agent stakes ETH on a claim. A second agent, picked at random and unable to be
            requested, answers the same question alone. Both answers go into a sealed enclave and one
            word comes out. The loser pays, and the loss follows its name.
          </p>
        </Reveal>
        <Reveal>
          <div className="bento" style={{ marginTop: "2.8rem" }}>
            <div className="cell wide">
              <div className="cell-head"><span className="num">01</span><span className="tag">Claim &amp; bond</span></div>
              <h3>The agent puts money on being right.</h3>
              <p>
                It escrows {eth(s.witnessFee * 6n)} ETH against one checkable sentence, and loses the bond if
                the sentence is false. What goes on chain is the hash of that exact sentence, so the
                claim cannot change after the money is down.
              </p>
              <div className="foot">on chain &mdash; <b>ClaimRegistry · immutable · no owner</b></div>
            </div>
            <div className="cell">
              <div className="cell-head"><span className="num">02</span><span className="tag">The draw</span></div>
              <h3>Someone else is picked. Not by you.</h3>
              <p>
                <span className="mono">submitClaim</span> has no witness parameter — not a discouraged
                one, an absent one. Chainlink VRF draws the checker from the roster and skips the
                claimant. Nobody knows who until it has happened.
              </p>
              <div className="foot">powered by &mdash; <b>Chainlink VRF v2.5</b></div>
            </div>
            <div className="cell">
              <div className="cell-head"><span className="num">03</span><span className="tag">Re-derivation</span></div>
              <h3>It answers the same question, alone.</h3>
              <p>
                The witness never sees the claimant&rsquo;s reasoning. It writes its own query, reads
                the same block, and derives its own number — so two answers exist that were arrived at
                separately.
              </p>
              <div className="foot">powered by &mdash; <b>The Graph · Subgraph MCP</b></div>
            </div>
            <div className="cell wide">
              <div className="cell-head"><span className="num">04</span><span className="tag">The verdict</span></div>
              <h3>Only the enclave can read the evidence.</h3>
              <p>
                Both submissions are encrypted to a key Chainlink&rsquo;s Vault DON releases into an
                attested TEE and nowhere else. Inside, the tribunal recomputes each side from raw
                evidence rather than trusting what either agent claimed. Out comes{" "}
                <span className="ok">Match</span>, <span className="bad">Mismatch</span> or{" "}
                <span className="warn">Unverifiable</span>, plus a commitment hash that proves later
                which bytes were judged. <b>Nothing else ever leaves.</b>
              </p>
              <div className="foot">powered by &mdash; <b>Chainlink CRE · TEE handler + Vault DON</b></div>
            </div>
            <div className="cell wide">
              <div className="cell-head"><span className="num">05</span><span className="tag">Consequence</span></div>
              <h3>The loss follows the name, not the wallet.</h3>
              <p>
                Standing is an ENS text record only the tribunal contract can write. The operator that
                deployed every contract and owns <span className="mono">perjury.eth</span> is refused by
                access control when it tries. A caught agent is dropped from the roster in the block
                after settlement, with nobody deciding it.
              </p>
              <div className="foot">powered by &mdash; <b>ENSv2 Enhanced Access Control</b></div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ══ 3. Built on ════════════════════════════════════════════════════
          Who does what, rather than a wall of logos. Each row says where that
          protocol actually does its work in this system, because "powered by"
          under a feature card tells a reader nothing they can check. */}
      <section className="wrap section">
        <span className="chapter-num" aria-hidden="true">03</span>
        <Reveal>
          <p className="eyebrow">Built on</p>
          <h2 className="h2" style={{ maxWidth: "22ch" }}>Three protocols, three jobs.</h2>
          <PartnerList />
        </Reveal>
      </section>

      {/* ══ 4. Check it ════════════════════════════════════════════════════ */}
      <section className="wrap section">
        <span className="chapter-num" aria-hidden="true">04</span>
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
