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
| 2 | `localhost:3111/replay?d=sim&claim=25` | not started, scrolled to top |

> **`?d=sim` is not optional.** The contracts were redeployed on Sep 11 so the verdict sink could accept the Forwarder a DON-deployed workflow reports through, and a new registry starts counting claims at 1. Claim 25 lives on the previous cascade. Without `d=sim` the page reads the live registry, where claim 25 does not exist, and shows you a different claim. Everything it holds is still on chain and still replayable — that is what the parameter is for.

**Use the step pad, not Play.** There is a small fixed control on the right edge of the replay: **▲ / count / ▼**. Each press of ▼ advances exactly one beat and the page scrolls itself to it. That is the whole demo — eleven presses, at whatever pace you are talking. Play exists and runs on a clock; with a room listening you do not want a clock.

- The counter reads **`n / 11`**, so you always know where you are without looking at the page.
- ▲ steps back. Use it if a question drags you backwards; you will not lose your place.
- Browser zoom **110–125%**. Shared screens shrink and the replay's mono type is small.
- **Hands off the scroll wheel.** The page positions each beat for you; scrolling by hand switches that off until you press Reset or Play.
- Don't touch "Replay another" at the bottom — on the archived cascade, claims 14–17 are draw probes and 21 settled `Unverifiable`.
- *If you would rather let it run:* set the speed to **10×** (6m10s of chain time becomes ~37s) and use Pause at the seal. Everything below still applies, you just stop pressing ▼.

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

## 2:20 — 4:00 · Step through it

**Press ▼ once per beat.** Say the line, then press again. Nothing is on a timer, so take the pauses you want. Beats 1–5 carry the argument; 6–11 are the consequence and can go quickly.

| ▼ | What appears | Say |
|---|---|---|
| **1** | Claimant reads the indexer — **64.66%** | "The claimant reads a subgraph and stakes ETH on that number." |
| **2** | Claim submitted, bond escrowed | "What goes on chain is the hash of that exact sentence — so the claim can't change after the money is down." |
| **3** | Drawn as witness by VRF | *Point at the draw panel, don't narrate it.* "Chainlink VRF picks the checker. Look — the random word landed on the claimant itself, and the walk stepped straight past it. You can't audit yourself and you can't pick your auditor." |
| **4** | Witness reads independently — **40.43%** | "A completely separate agent reads the same block, on its own, and gets a different number." |
| **5** | **The verdict, and the seal** — *slow down here* | "Here's the part that matters. Both submissions were encrypted to a key only the enclave holds — Chainlink's Vault DON releases it into an attested TEE and nowhere else. The store they travel through is a public URL holding nothing but ciphertext." |
| | *Point at the dark* **NEVER PUBLISHED** *box.* | "Inside, the tribunal recomputes both values from the raw evidence rather than trusting what either agent claimed. Out comes a verdict and a commitment hash. Nothing else ever leaves — not the values, not the queries, not either methodology." |
| | *Point at the number line.* | "And this is the whole argument in one line. Both agents were handed **identical rows**. One concluded 64.66, the other 40.43. The claimant's own evidence refutes its claim. It's caught by arithmetic, not by opinion." |
| **6** | Appealed, appeal bond posted | "It appealed." |
| **7** | VRF seats a panel of three | "Three more agents drawn at random, none of them a party to the claim." |
| **8** | Panel upheld | "All three agreed with the witness." |
| **9** | Claimant slashed | "It loses the bond, the appeal bond, and its stake. That ETH goes to nobody — not even the witness, because paying the witness is exactly what would make faking a disagreement profitable." |
| **10** | Witness paid its flat fee | "The witness gets the same fee either way." |
| **11** | Settled | "And its ENS standing drops. The roster stops drawing it in the next block, with nobody deciding that. That's the whole loop." |

**Stop.**

> **If you are running short:** press ▼ through 6–10 without commentary and land on 11. The argument is complete after beat 5; everything after it is the price.

---

## If you have spare seconds

Press **Reset** and then **Play** at 30× to run the whole thing through in twelve seconds: *"and that's it at real proportions — most of the time is waiting for VRF and for the challenge window."* Or switch to `/roster`: *"this is who's currently allowed to judge, read from ENS at the moment of the draw."*

## If they ask

**"Are those real ENS names?"** — *worth volunteering if ENS is in the room.*

> "They are now, and they weren't until Tuesday. The name was registered, the Permissioned Resolver was deployed, the per-key access control was real — but `perjury.eth` had no subregistry and pointed at the deployment's default resolver, so `witness-a.perjury.eth` didn't exist in ENS at all. Our own reader worked because it has the resolver address compiled into it, which is knowing where to look rather than resolving. The ENS explorer said the name didn't exist and it was right. There's a subregistry now, each agent owns its own subname, and every one resolves through the Universal Resolver and returns its standing."

**"What does the TEE actually do that a server couldn't?"** — the best question you'll get.

> "It's the only party that can read the evidence at all. The key never leaves Chainlink's Vault DON. And the commitment it publishes lets anyone prove afterwards that it judged those exact bytes, without the protocol ever publishing them — we used that to recover three settled claims' evidence and reject seven decoys."

**"Could the two agents just collude?"**

> "They can agree to. They can't arrange to be paired — assignment is pushed by VRF and there's no witness parameter to ask with. The roster is ten agents now, so an accomplice comes up about one time in ten. It's throttled, not eliminated, and the honest framing is that n is the whole argument — which is why the roster being open to anyone who can post a stake matters more than the number today. In the replay you're watching, the roster was five."

**"Is this a real enclave?"** — *the answer changed on Sep 11. Use this one.*

> "Partly, and I'll be precise about which part. Deploy access came through, so the workflow is deployed to the Chainlink DON and it does execute in a real enclave — it reads the registry to find its own claim, fetches the sealed evidence over Confidential HTTP, opens it with keys the Vault DON releases into the enclave, adjudicates, and reaches consensus. Every one of those steps succeeds.
>
> What doesn't work yet is the last one. `WriteReport` reports success and no transaction reaches Sepolia — not a revert, no transaction at all. I checked that against a throwaway contract that accepts any sender and any payload, and it was never called, so the write isn't being broadcast. That's on the platform side and I've raised it with Chainlink. So every verdict you can see settled on chain came through the CLI simulator, which writes to the same contracts without trouble."

**"So what did deploying actually buy you?"**

> "The sentence I just said. Before Tuesday the honest version was 'we register a TEE handler and run it locally.' Now adjudication genuinely happens inside an enclave on their network. Two bugs came out of doing it that the simulator can't catch, because it reads secrets from a local file: the CLI files secrets under one namespace and the SDK asks for another, and two separate secret reads in one execution fail on the second while the first succeeds. Both are in the feedback I sent them."

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

Live at https://perjury.vercel.app — claim 25 is the one to look at. It ran for
real, took 6m10s end to end, and the site replays it from its own transactions:
https://perjury.vercel.app/replay?d=sim&claim=25
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
  Deployed to the DON and executing in a real enclave: it reads the registry
  to find its own claim, fetches, opens, adjudicates, reaches consensus.
  WriteReport reports success and lands no transaction, which is open with
  the Chainlink team — so every verdict settled on chain came through the CLI
  simulator against the same contracts.
· Chainlink VRF v2.5 — draws every witness and appeal panel. submitClaim
  takes a subject and a commitment; there is no witness parameter.
· ENS v2 — a subname registry under perjury.eth issues each agent a real
  subname it owns itself. Standing is a text record, and Enhanced Access
  Control scopes the write to the tribunal contract alone: the operator that
  deployed everything and owns the name REVERTS. Resolve any of them through
  the Universal Resolver and you get the standing back.
· The Graph — 13 pinned deployments, 2 schema families, 5 chains, live
  Gateway only. A deployment id is a hash of the mapping code, which is why
  two reads are independent and an RPC cannot offer that.

Check it async:
· live: https://perjury.vercel.app
· the roster: https://perjury.vercel.app/roster
· repo: https://github.com/krishnan74/perjury
· technical integrations: docs/partner-integrations.md
· ledger of every tx: docs/TX_HASHES.md
· registry 0x398907AbE00070127780F24C05B629cb8fEC51eb on Sepolia
  (claims 1+; the earlier cascade at 0x8CDa96E6...87A88 holds claims 1-25,
   including the appeal above — ids restart when the sink is redeployed)

Run the proofs yourself:
  npx tsx scripts/prove-sealed.ts         # evidence store holds ciphertext
  npx tsx scripts/prove-eac.ts            # two reverts, one success
  npx tsx scripts/prove-corroboration.ts  # indexers disagree → Unverifiable

Known limits, up front: the deployed workflow's WriteReport lands no
transaction, so settled verdicts came via the simulator. 12 of 13 pinned
subjects are single-source, so corroboration is real for one and labelled
absent for the rest. One witness decides an outcome; K-of-N is not built.
```

**The site is deployed.** A mentor can click rather than clone.

## Ask them

- Do 0.01 bond / 0.002 fee / 0.02 appeal bond / 0.01 stake deter anything at real value?
- A witness earns a flat fee either way. Is that enough reason to work rather than rubber-stamp?
- Who is the first real user? Claims are DeFi metrics today, and that is a choice rather than a requirement.
- If you had to cut one of the three integrations, which?
- One witness decides an outcome. Is K-of-N worth building before anything else?
