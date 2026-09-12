# Demo script — 4:00, single take

Word for word, with the delivery marked. **540 words of speech.** With the pauses and clicks that is about **3:50** at a normal presenting pace — roughly 160 words a minute, which is conversational, not fast. There is not much slack against the 4:00 rejection line, so there are two time checkpoints in the script and a cut list at the bottom. Read one section aloud against a stopwatch before you record, so you know which end of that range you actually talk at.

**Read this section once before you record.** The script below is written to be *said*, not read. Short sentences, contractions, a few deliberate fragments. If a line feels awkward in your mouth, change it — the shape matters more than the words. What matters is that you have decided in advance where the pauses go, because unplanned pauses are what make someone sound like they are reading and planned ones are what make them sound like they are thinking.

Three habits that carry a single take:

- **Look at the thing you are talking about.** Your voice follows your eyes. If you are describing the seal, be looking at the seal.
- **Land the last word of a sentence and stop.** Trailing off into the next sentence is the single clearest tell of a script being read.
- **If you fumble a word, keep going.** Judges do not notice a stumble. They notice a restart.

## Rules you cannot break

| | |
|---|---|
| Length | **2:00 minimum, 4:00 maximum.** Automatic rejection outside it |
| Speed | Do **not** speed up footage. Editing out waiting is fine, speeding up is not |
| Voice | Your own. No text-to-speech, no AI voiceover |
| Recording | Not a phone. 720p or better |
| Intro | Under 20 seconds of backstory |

Judged on technicality, originality, practicality, usability and WOW factor. This script front-loads originality and spends its middle on practicality.

Sources: [ETHOnline 2026 details](https://ethglobal.com/events/ethonline2026/info/details) · [ETHGlobal judging criteria](https://ethglobal.com/events/ethonline2025/prizes)

---

## Set up before you press record

Run this first and read the output. It takes about eight seconds and it is the one thing that can quietly break the demo:

```bash
npx tsx scripts/verify-pinned.ts
```

Then arrange three windows.

| # | What | State |
|---|---|---|
| 1 | `https://perjury.vercel.app` | scrolled to the very top |
| 2 | `https://perjury.vercel.app/replay?d=sim&claim=25` | loaded, not started, scrolled to top |
| 3 | A terminal in the repo, `npm run prove` **typed but not run** | large font, cleared screen |

Window 3 is the closer and it is worth the tab switch. The four proofs run concurrently, so it finishes in about ten seconds and the rows land one at a time as each answers. You talk over it while it runs.

> **`?d=sim` is not optional.** The contracts were redeployed twice since claim 25 settled, and a new registry starts counting at 1. Without the parameter the page reads the live registry, where claim 25 is a different claim entirely. Everything claim 25 holds is still on chain — that is what the parameter is for.

**Use the step pad, not Play.** Small fixed control on the right edge: **▲ / count / ▼**. Each ▼ advances one beat and scrolls the page to it. Eleven presses, at your pace, no clock. Zoom the browser to **110–125%** — the mono type is small on a shared screen. **Hands off the scroll wheel**, it switches off the auto-positioning.

---

## 0:00 — 0:18 · The hook

*Window 1, hero, still. Do not scroll while you say this.*

> An AI agent tells you Aave's utilization is **sixty-four point six six percent**.
>
> *(beat)*
>
> Did it read that? Or did it make it up?
>
> *(beat — let the question sit)*
>
> You can't tell. And its logs won't help you, because the agent writes its own logs.
>
> This is **Perjury**. It makes agents bet on what they say.

## 0:18 — 0:48 · Why it matters

*Scroll to section 01. Let the headline arrive before you talk over it.*

> Right now that's annoying. Soon it's structural — agents are acting on each other's output, and the only way to check a claim is to redo the work yourself.

*Scroll to the three cards. Point at each one as you say it. Do not read them aloud.*

> Three obvious fixes, and all three break. Read the logs — written by the defendant. Let the agent pick its checker — an auditor you choose isn't an auditor. Publish the evidence — and everyone learns exactly what passes.

## 0:48 — 1:16 · The mechanism

*Scroll to section 02. Stop on the paragraph under the headline.*

> So: make it bet, and make someone else check.
>
> An agent stakes ETH on one checkable sentence. A second agent is picked at random to answer the same question, on its own. Both answers go into a sealed enclave. **One word comes out.** The loser pays — bond, stake, reputation.

*Scroll through the five cards. Slow down on the second one.*

> And it can't ask for a friendly checker. There's no witness parameter.

## 1:16 — 1:30 · What it's built on

*Scroll to section 03. Point at each row as you name it. Do not expand here — each one comes back with evidence attached during the replay, which is a better place to make the case than a list.*

> Three protocols do the work. **The Graph** supplies the facts under dispute. **Chainlink** draws the checker and runs the tribunal. **ENS** holds the reputation. You'll see all three in a second.

*Switch to window 2.*

> ⏱ **Checkpoint: you should be at about 1:30 here.** Over 1:45 and you will not fit — take the first cut from the list at the bottom.

## 1:30 — 1:46 · Say this before you press anything

*This is the difference between a demo and a claim you can't back. Do not skip it.*

> Now the real thing. This is claim twenty-five, and it **already happened**, on Sepolia. Six minutes ten, start to finish.
>
> I'm replaying it from its own transactions. Every hash real. Every gap what actually elapsed.

*Point at the `ELAPSED ON CHAIN` chip.*

## 1:46 — 3:25 · Step through it

*One ▼ per beat. Say the line, then press. Nothing is on a timer.*

**▼ 1** — claimant reads the indexer, 64.66%

> The claimant reads a subgraph. Sixty-four point six six. It bonds ETH on that number.

**▼ 2** — claim submitted, bond escrowed

> What goes on chain is the **hash** of that exact sentence. So it can't soften the claim once the money's down.

**▼ 3** — VRF draw

*Point at the draw panel. Let them look at it. Do not narrate the mechanism.*

> VRF picks the checker. And watch — the random word landed on the claimant **itself**, and the walk stepped straight past it.
>
> You can't audit yourself.

**▼ 4** — witness reads independently, 40.43%

> A completely separate agent reads the same block. Forty point four three.

**▼ 5** — the verdict and the seal · **slow right down, this is the centre**

> Here's the part that matters.
>
> Both submissions were encrypted to a key only the enclave holds. Chainlink's Vault DON releases it inside an attested TEE and nowhere else. The store they travel through is a public URL full of ciphertext.

*Point at the dark* **NEVER PUBLISHED** *box.*

> Inside, the tribunal recomputes both numbers from the raw rows. It doesn't trust either agent's conclusion. Out comes a verdict and a commitment hash. That's all. Not the values, not the queries, not the methods.

*Point at the number line. This is your strongest ten seconds — do not rush it.*

> And this is the whole argument, in one line. **Identical rows.** One agent concluded sixty-four. The other, forty.
>
> The claimant's own evidence refutes its claim. Caught by arithmetic, not opinion.

> ⏱ **Checkpoint: about 3:00 here.** If you are past 3:10, press through the rest without commentary and say only the last two sentences.

**▼ 6 → 11** — appeal, panel, slash, settle · *press through these at a steady clip*

> It appealed. Three more agents, drawn at random. All three sided with the witness.
>
> It loses the bond, the appeal bond, and its stake — and that ETH goes to **nobody**. Not even the witness. Paying the witness is what makes faking a disagreement profitable.
>
> Its standing drops, and the roster stops drawing it next block. Nobody decided that.

## 3:25 — 3:50 · The closer

*Switch to window 3. Press enter, then talk over it as the rows land.*

> One last thing. Everything I just told you, you can check yourself.

*The rows appear over about twenty seconds. Name them as they arrive.*

> Four proofs, against live chain state. The evidence store holds ciphertext. Independent indexers have to agree, or the claim comes back unverifiable. Only the tribunal can write reputation.
>
> No fixtures. Every one of those reads Sepolia or the live Graph gateway.

*Wait for the green line.*

> That's Perjury. Thanks for watching.

**Stop recording.**

---

## If you are running long

Cut in this order, and only in this order.

1. **The three cards in section 01.** Say only *"Three obvious fixes, and all three break"* and move on. Saves 14s.
2. **Beats 6 through 11.** Press through them without commentary and say only *"Its standing drops, and the roster stops drawing it next block. Nobody decided that."* Saves 18s.
3. **The closer's middle line.** Press enter, wait, and say only *"Four proofs, against live chain state. No fixtures. That's Perjury."* Saves 12s.

Taking all three brings a 4:05 take down to about 3:20.

**Never cut** the disclaimer at 1:30 or the identical-rows line at beat 5. The disclaimer is what makes the replay honest rather than a claim you cannot back, and the identical-rows line is the single strongest sentence in the video.

## If something goes wrong mid-take

- **A page is slow to load.** Keep talking. There is always a sentence you can say about what is coming.
- **You press ▼ twice.** Press ▲ once and carry on. Do not apologise on camera.
- **`npm run prove` shows a red row.** Say the true thing and keep walking: *"that one's a subgraph with no indexer allocated right now — the guard fails closed rather than read it, which is the behaviour I want."* It is a better moment on camera than an all-green table, so do not be thrown by it.
- **You run over 4:00.** Do not upload it. There is no appeal on the length rule and no way to fix it in the edit except cutting a whole beat, which you can do — the eleven replay beats are separate takes as far as the video is concerned.

---

## If they ask

**"Is this a real enclave?"** — *the answer changed on Sep 12. This is the current one.*

> Yes, and I'll be precise about which part. Deploy access came through, the workflow is deployed to the Chainlink DON, and it executes in an AWS Nitro enclave. It reads the registry to find its own pending claim, fetches the sealed evidence over Confidential HTTP, opens it with keys the Vault DON releases into the enclave, adjudicates, reaches consensus, and writes the verdict on chain through the production Forwarder. There's a settled claim on Sepolia that went that whole way with no simulator involved.
>
> What blocked that for a day was ours, and it's worth knowing. The Forwarder staticcalls `supportsInterface` on a receiver before it routes a report. Our sink didn't implement ERC-165, so the call reverted, the Forwarder recorded the report as failed — and the workflow was told the write **succeeded**, because the Forwarder's own transaction did. The simulator's mock Forwarder never makes that check, so the receiver worked perfectly in simulation and could not receive a single report on the DON.

**"Are those real ENS names?"** — *worth volunteering if ENS is in the room.*

> They are now, and they weren't a few days ago. The name was registered, the Permissioned Resolver was deployed, the per-key access control was real — but `perjury.eth` had no subname registry and pointed at the deployment's default resolver, so `witness-a.perjury.eth` didn't exist in ENS at all. Our own reader worked because it has the resolver address compiled into it, which is knowing where to look rather than resolving. The explorer said the name didn't exist and it was right, and I assumed the explorer was broken.
>
> There's a subregistry now, each agent owns its own subname, and the roster page reads every name **twice** — once through our reader, which is what actually decides eligibility, and once through the Universal Resolver, which is what anyone else would do. If those two ever disagree the page prints it.

**"Could the two agents just collude?"**

> They can agree to. They can't arrange to be paired — assignment is pushed by VRF and there's no witness parameter to ask with. The roster is ten agents, so an accomplice comes up about one time in ten. That's throttled, not eliminated, and the honest framing is that n is the whole argument. Which is why the roster being open to anyone who can post a stake matters more than today's number.

**"What does the TEE do that a server couldn't?"** — the best question you'll get.

> It's the only party that can read the evidence at all. The key never leaves Chainlink's Vault DON. And the commitment it publishes lets anyone prove afterwards that it judged those exact bytes, without the protocol ever publishing them — we used that to recover three settled claims' evidence and reject seven decoys.

**"Can I try it?"**

> Yes, `/submit` on the site, no password. It runs a real claim end to end from the browser. It's capped at twenty-five a day because every run pays for a model call and real gas, and the counter resets at midnight UTC.

**"What are the extra rows on the roster?"**

> Those are the control registration from the name-binding proof. It registers a name it was legitimately issued to show the success case, then withdraws and deregisters. `agentList` is append-only so the row stays, and it's shown rather than filtered because a registry that quietly drops entries isn't a registry.

## Never say

- **Never** "it runs in a TEE" about the simulator path. The deployed workflow executes in an enclave; `cre workflow simulate` runs locally. Both are true of this project and they are different sentences.
- Not "two different queries against two different indexers". Same deployment, same selection. The true version is stronger: **same block, same rows, different conclusions.**
- Not "standing decides eligibility". `isEligible` tests the cooldown flag, the stake floor, and whether the ENS record reads at all.
- If corroboration comes up: **1 of 13** pinned subjects has a genuinely independent second index. Say it before they find it.

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
| Enclave settlement | `0xf8dd4d0219ccfd9a723409fbd8d19c88a87c91547c123805e6ff16f3d1c657c5` |

---

## The chat post

```
Perjury — a verification protocol for AI agent claims.

An agent states a fact and bonds ETH on it. A second agent is assigned at
random to check it. Both sides' evidence is adjudicated inside a confidential
Chainlink CRE handler running in an enclave, which publishes a verdict and a
commitment hash and nothing else. The loser forfeits its bond, its stake, and
its ENS reputation.

The forfeited bond is paid to NOBODY, including the witness. Paying the
witness is exactly what would make fabricating disagreement profitable.

Live at https://perjury.vercel.app — claim 25 is the one to look at. It ran for
real, took 6m10s end to end, and the site replays it from its own transactions:
https://perjury.vercel.app/replay?d=sim&claim=25
· claimant said 64.66%, witness derived 40.43%, from IDENTICAL rows
· seed % 5 landed on the claimant; the roster walk stepped past it
· appealed, and a panel of three upheld it
· ENS standing -3 → -6, roster stops drawing the agent in the next block

Check every claim above in about twenty seconds:
  npm run prove              # 4 read-only proofs vs live chain state
  npm run prove -- --all     # plus the two that write on chain

Partners:
· Chainlink CRE — the centre of it. A TEE handler adjudicates evidence that
  is ECIES-sealed to a key the Vault DON releases into the enclave and
  nowhere else, so the tribunal is the only party that can read what it
  judges. Confidential HTTP in, a Forwarder write out: four fields, a verdict
  and a commitment hash, and nothing else ever leaves. Deployed to the DON,
  executing in an AWS Nitro enclave, and settling on chain from there:
  0xf8dd4d0219ccfd9a723409fbd8d19c88a87c91547c123805e6ff16f3d1c657c5
· Chainlink VRF v2.5 — draws every witness and appeal panel. submitClaim
  takes a subject and a commitment; there is no witness parameter.
· ENS v2 — a subname registry under perjury.eth issues each agent a real
  subname it owns itself. Standing is a text record, and Enhanced Access
  Control scopes the write to the tribunal contract alone: the operator that
  deployed everything and owns the name REVERTS. The roster page resolves
  every name through the Universal Resolver as well as through our own
  reader, and prints it if the two disagree.
· The Graph — 13 pinned deployments, 2 schema families, 5 chains, live
  Gateway only. A deployment id is a hash of the mapping code, which is why
  two reads are independent and an RPC cannot offer that.

Try it yourself, no password:
· post a real claim: https://perjury.vercel.app/submit
· the roster: https://perjury.vercel.app/roster
· repo: https://github.com/krishnan74/perjury
· technical integrations: docs/partner-integrations.md
· ledger of every tx: docs/TX_HASHES.md

Known limits, up front: 12 of 13 pinned subjects are single-source, so
corroboration is real for one and labelled absent for the rest. One witness
decides an outcome; K-of-N is not built. The collusion argument is
probabilistic and rests on the roster being large and open.
```

## Ask them

- Do 0.01 bond / 0.002 fee / 0.02 appeal bond / 0.01 stake deter anything at real value?
- A witness earns a flat fee either way. Is that enough reason to work rather than rubber-stamp?
- Who is the first real user? Claims are DeFi metrics today, and that is a choice rather than a requirement.
- If you had to cut one of the three integrations, which?
- One witness decides an outcome. Is K-of-N worth building before anything else?
