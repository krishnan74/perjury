# Demo script — 4 minutes, screen share, browser only

> Shared screen, talking over it. **Nothing is run live and no terminal is opened.** The whole demo happens on the site.
>
> Flow: **Hero → 01 The problem → 02 The mechanism → 03 Built on → The replay.**
>
> Partner detail stays *minimal* in section 03 — you expand on it after the demo, so all it has to do there is name the three and say what each one does in one clause.
>
> **Chainlink weighting: CRE first, VRF second.** The draw explains itself visually — point at it, don't narrate it. Spend words on the seal.

## Before you share

```bash
cd app && npx next dev -p 3111
```

| Tab | URL | State |
|---|---|---|
| 1 | `localhost:3111/` | scrolled to the very top |
| 2 | `localhost:3111/replay?claim=25` | **speed 10×**, not played, scrolled to top |

- **10× is the setting that matters.** Claim 25 is 6m10s of real chain time; 10× makes it ~37 seconds of playback. 30× is 12 seconds and you will be talking over a finished animation.
- Browser zoom **110–125%**. Shared screens shrink and the replay's mono type is small.
- **Hands off the scroll wheel once playback starts.** The page follows the beats itself; scrolling releases that for the rest of the run.
- Don't touch "Replay another" at the bottom — claims 14–17 are draw probes, 21 settled `Unverifiable`.

---

## 0:00 — 0:20 · Hero *(Tab 1, top)*

Sit still on the hero. Don't scroll while you say this.

> "This is Perjury. It's a verification protocol for claims made by AI agents. Everything you're about to see is deployed on Sepolia and it's all read from chain — nothing on this page is mocked."

## 0:20 — 0:55 · 01 The problem

Scroll to `01`. **Let the headline land before you talk.**

> "The problem is this. An AI agent tells you a number. It might have read it. It might have invented it. And the only way to find out is to do the work again yourself — which is the work you asked it to do in the first place."

Scroll slightly to the second paragraph.

> "Logs don't fix it, because the log is written by the thing you're auditing. And even an honest log tells you the method, not whether the answer was right."

Scroll to the three cards. **Point, don't read them out.**

> "Three obvious fixes. Read the logs — written by the defendant. Let the agent pick a checker — an auditor you choose isn't an auditor. Publish the evidence — now every future claimant knows exactly what gets checked and tailors a claim to pass it. Each one breaks."

## 0:55 — 1:35 · 02 The mechanism

Scroll to `02`. Stop on the paragraph under the headline.

> "So the design is: make it bet, and make someone else check. An agent stakes ETH on one checkable sentence. A second agent — picked at random, and impossible to request — answers the same question on its own. Both answers go into a sealed enclave, and one word comes out. The loser pays, and the loss follows its name."

Scroll through the five cards, pausing on each for about five seconds.

> "Claim and bond. The draw — and note, `submitClaim` has no witness parameter, so there's no code path to ask for a particular checker. Re-derivation, alone. The verdict, computed in private. And the consequence — a reputation the agent can't edit."

## 1:35 — 2:00 · 03 Built on *(keep this short)*

Scroll to `03`. Point at each row as you name it. **Twenty-five seconds, no more.**

> "Three protocols, three jobs. Chainlink CRE is the centre — it's the only party that can read the evidence it judges. Chainlink VRF decides who checks. ENS holds the reputation. And The Graph supplies the facts under dispute. I'll go deeper on any of these afterwards."

Then move to Tab 2.

---

## 2:00 — 2:20 · The replay — say the disclaimer first

**Say this before you press anything.** It is the difference between a demo and a claim you cannot back.

> "Now the actual thing. This is claim 25, and it is important to be clear about what you're looking at: **this already happened on chain.** It ran for real on Sepolia and took six minutes ten seconds end to end — most of that waiting for VRF and for a ninety-second challenge window. **I'm replaying it from its own transactions.** Every hash is real, every gap is what actually elapsed, and the only thing compressed is the waiting. The counter in the corner always shows true elapsed chain time, whatever speed I run it at."

Point at the `ELAPSED ON CHAIN` chip.

## 2:20 — 3:00 · Press Play, narrate the first half

Press **Play**. Don't scroll — the page follows.

| On screen | Say |
|---|---|
| Beat 1, claimant reads. Point at **64.66%** | "The claimant reads a subgraph and stakes ETH on that number." |
| Beat 2, claim submitted | "What goes on chain is the hash of that exact sentence — so the claim can't change after the money's down." |
| Beat 3, the draw. **Point, don't explain** | "Chainlink VRF picks the checker. Look at this — the random word landed on the claimant itself, and the walk stepped straight past it. You can't audit yourself and you can't pick your auditor." |
| Beat 4, witness reads. Point at **40.43%** | "A completely separate agent reads the same block, on its own, and gets a different number." |

## 3:00 — 3:35 · Hit Pause at the seal

**The moment the dark box appears, press Pause.** This is the centre of the demo and you need it static.

> "Here's the part that matters. Both submissions were encrypted to a key that only the enclave holds — Chainlink's Vault DON releases it into an attested TEE and nowhere else. The store they travel through is a public URL, and it holds nothing but ciphertext."

Point at the dark **NEVER PUBLISHED** box.

> "Inside, the tribunal recomputes both values from the raw evidence rather than trusting what either agent claimed. Out comes a verdict and a commitment hash. Nothing else ever leaves — not the values, not the queries, not either methodology."

Point at the number line.

> "And this is the whole argument in one line. Both agents were handed **identical rows**. One concluded 64.66, the other 40.43. The claimant's own evidence refutes its claim. It's caught by arithmetic, not by opinion."

## 3:35 — 4:00 · Resume and land it

Press **Resume**.

| On screen | Say |
|---|---|
| Appeal + panel of three | "It appealed. Three more agents drawn at random, none of them a party to the claim. All three agreed with the witness." |
| Claimant slashed | "It loses the bond, the appeal bond, and its stake. That ETH goes to nobody — not even the witness, because paying the witness is exactly what would make faking a disagreement profitable." |
| Settled | "And its ENS standing drops. The roster stops drawing it in the next block, with nobody deciding that. That's the whole loop." |

**Stop.**

---

## If you have spare seconds

Scroll down on the replay to the **"Replay another"** row and point at it: *"every settled claim on this deployment is replayable the same way."* Or switch to `/roster`: *"and this is who's currently allowed to judge, read from ENS at the moment of the draw."*

## If they ask

**"What does the TEE actually do that a server couldn't?"** — the best question you'll get.

> "It's the only party that can read the evidence at all. The key never leaves Chainlink's Vault DON. And the commitment it publishes lets anyone prove afterwards that it judged those exact bytes, without the protocol ever publishing them — we used that to recover three settled claims' evidence and reject seven decoys."

**"Could the two agents just collude?"**

> "They can agree to. They can't arrange to be paired — assignment is pushed by VRF and there's no witness parameter to ask with. With five agents the accomplice comes up about one time in three, so it's throttled, not eliminated. We say that on the page rather than claiming otherwise."

**"Is this a real enclave?"**

> "No, and I won't claim it is. We register a real TEE handler and execute it through Chainlink's CLI simulator, which runs locally. Confidential-DON deploy access was requested and not granted."

## Never say

- **Never** "ran inside an enclave". Say *"a confidential workflow with a TEE handler, executed via the simulator."*
- Not "two different queries against two different indexers". Same deployment, same selection; what differs is the block pin. The true version is stronger: **same block, same rows, different conclusions.**
- Not "standing decides eligibility". `isEligible` tests the cooldown flag, the stake floor and whether the ENS record reads at all.
- If corroboration comes up: **1 of 13** pinned subjects has a second index. Say it before they find it.

## Numbers, if pressed

| | |
|---|---|
| Claim | `Aave v3 utilization_ratio is above 64.66%.` |
| Total on chain | **6m 10s**, 11 events |
| Claimant | `panel-2.perjury.eth` — 64.66% |
| Witness | `panel-3.perjury.eth` — 40.43%, same block `25946420` |
| Divergence | 24.23 points, from identical rows |
| Agreement band | 40.23–40.63% (50 bps of the witness's value) |
| Panel | `operator` 40.43 · `witness-a` 40.435 · `panel-1` 40.41 |
| Outcome | Mismatch upheld · standing −3 → −6 · excluded next block |

---

## The chat post

```
Perjury — a verification protocol for AI agent claims.

An agent states a fact and bonds ETH on it. A second agent is assigned at
random to check it. Both sides' evidence is adjudicated inside a confidential
Chainlink CRE handler, which publishes a verdict and a commitment hash and
nothing else. The loser forfeits its bond, its stake, and its ENS reputation.

The forfeited bond is paid to NOBODY, including the witness. Paying the
witness is exactly what would make fabricating disagreement profitable.

Live on Sepolia, claim 25 — the one to look at. It ran for real, took 6m10s
end to end, and the site replays it from its own transactions:
· claimant said 64.66%, witness derived 40.43%, from IDENTICAL rows
· seed % 5 landed on the claimant; the roster walk stepped past it
· appealed, and a panel of three upheld it
· ENS standing -3 → -6, roster stops drawing the agent in the next block

Partners:
· Chainlink CRE — the centre of it. A TEE handler adjudicates evidence that
  is ECIES-sealed to a key the Vault DON releases into the enclave and
  nowhere else, so the tribunal is the only party that can read what it
  judges. Confidential HTTP in, a Forwarder write out: four fields, a verdict
  and a commitment hash, and nothing else ever leaves. The commitment lets
  anyone later verify it judged those exact bytes — we used that to recover
  three settled claims' evidence and reject seven decoys.
  (Executed via the CLI simulator, which runs locally. Not a real enclave.)
· Chainlink VRF v2.5 — draws every witness and appeal panel. submitClaim
  takes a subject and a commitment; there is no witness parameter.
· ENS v2 — agents are subnames of perjury.eth, standing is a text record,
  Enhanced Access Control scopes the write to the tribunal contract alone.
  The operator that deployed everything and owns the name REVERTS.
· The Graph — 13 pinned deployments, 2 schema families, 5 chains, live
  Gateway only. A deployment id is a hash of the mapping code, which is why
  two reads are independent and an RPC cannot offer that.

Check it async:
· repo: https://github.com/krishnan74/perjury
· technical integrations: docs/partner-integrations.md
· ledger of every tx: docs/TX_HASHES.md
· registry 0x8CDa96E615E96f97073C19Cc2167E4D242487A88 on Sepolia

Run the proofs yourself:
  npx tsx scripts/prove-sealed.ts         # evidence store holds ciphertext
  npx tsx scripts/prove-eac.ts            # two reverts, one success
  npx tsx scripts/prove-corroboration.ts  # indexers disagree → Unverifiable

Known limits, up front: the CRE workflow runs via the simulator, not a real
enclave. 12 of 13 pinned subjects are single-source, so corroboration is real
for one and labelled absent for the rest. No live triggering from the browser.
```

**No live URL yet, because the site is not deployed.** A mentor has to clone and run rather than click. Deploying is the highest-value hour before any session. Once it is up, add these and drop the repo to third:

```
· live: <url>/replay?claim=25
· the roster: <url>/roster
```

## Ask them

- Do 0.01 bond / 0.002 fee / 0.02 appeal bond / 0.01 stake deter anything at real value?
- A witness earns a flat fee either way. Is that enough reason to work rather than rubber-stamp?
- Who is the first real user? Claims are DeFi metrics today, and that is a choice rather than a requirement.
- If you had to cut one of the three integrations, which?
- One witness decides an outcome. Is K-of-N worth building before anything else?
