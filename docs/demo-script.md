# Demo script — 4:00, single take

Word for word, with the delivery marked. **531 words of speech.** With the pauses and the clicks that lands between **3:37 and 3:55** depending on how fast you talk — 160 words a minute is the middle of that and is conversational, not rushed. The margin against the 4:00 rejection line is real but thin, so there are two checkpoints in the script and a cut list at the bottom. Read one section aloud against a stopwatch before you record, so you know which end of the range you are actually at.

**There is no Q&A.** The video is the only thing you say about this project, so anything a judge needs to hear has to be inside these four minutes. That changes what the cut list can touch: an unsupported claim cannot be rescued later by a question, so a sentence that asserts something goes before a sentence that explains something.

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

## 0:48 — 1:12 · The mechanism

*Scroll to section 02. Stop on the paragraph under the headline.*

> So: make it bet, and make someone else check.
>
> An agent stakes ETH on one checkable sentence. A second agent is picked at random to answer the same question, on its own. Both answers go into a sealed enclave. **One word comes out.** The loser pays — bond, stake, reputation.

*Scroll through the five cards, slowing on the second. Do not narrate them — the "no witness parameter" point lands far harder at beat 3, where the draw is on screen stepping past the claimant, and saying it twice costs you twelve seconds you do not have.*

## 1:12 — 1:24 · What it's built on

*Scroll to section 03. Point at each row as you name it. Twelve seconds. Do not expand here — every one of the three comes back during the replay with its work on screen, which is a better place to make the case than a list is.*

> Three protocols do the work. **The Graph** supplies the facts, **Chainlink** draws the checker and runs the tribunal, **ENS** holds the reputation.

*Switch to window 2.*

> ⏱ **Checkpoint: you should be at about 1:24 here.** Past 1:40 and you will not fit — take the first cut from the list at the bottom.

## 1:24 — 1:40 · Say this before you press anything

*This is the difference between a demo and a claim you can't back. Do not skip it.*

> Now the real thing. This is claim twenty-five, and it **already happened**, on Sepolia. Six minutes ten, start to finish.
>
> I'm replaying it from its own transactions. Every hash real. Every gap what actually elapsed.

*Point at the `ELAPSED ON CHAIN` chip.*

## 1:40 — 3:22 · Step through it

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
> Both submissions were encrypted to a key only the enclave holds. And this isn't a simulation — the workflow is deployed on the Chainlink DON and runs in a real Nitro enclave. The Vault DON releases that key in there and nowhere else. Everything in transit is ciphertext in a public store.

*Point at the dark* **NEVER PUBLISHED** *box.*

> Inside, the tribunal recomputes both numbers from the raw rows. It doesn't trust either agent's conclusion. Out comes a verdict and a commitment hash. That's all. Not the values, not the queries, not the methods.

*Point at the number line. This is your strongest ten seconds — do not rush it.*

> And this is the whole argument, in one line. **Identical rows.** One agent concluded sixty-four. The other, forty.
>
> The claimant's own evidence refutes its claim. Caught by arithmetic, not opinion.

> ⏱ **Checkpoint: about 2:55 here.** If you are past 3:10, press through the rest without commentary and say only the last two sentences.

**▼ 6 → 11** — appeal, panel, slash, settle · *press through these at a steady clip*

> It appealed. Three more agents, drawn at random. All three sided with the witness.
>
> It loses the bond, the appeal bond, and its stake — and that ETH goes to **nobody**. Not even the witness, because that's what would make faking a disagreement profitable.
>
> Its standing drops, and the roster stops drawing it next block. Nobody decided that.

## 3:22 — 3:48 · The closer

*Switch to window 3. Press enter, then talk over it as the rows land.*

> One last thing. Everything I just told you, you can check yourself.

*The four rows land over about ten seconds, one at a time as each proof answers. Name them as they arrive rather than reading ahead of them.*

> Four proofs, against live chain state. The evidence store holds ciphertext. Independent indexers have to agree. Only the tribunal can write reputation.
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

**Never cut** three things. The disclaimer at 1:24, which is what makes the replay honest rather than a claim you cannot back. The identical-rows line at beat 5, which is the strongest sentence in the video. And the line saying the workflow runs on the DON in a real enclave, because with no Q&A that is the only chance anyone gets to hear it, and "sealed enclave" on its own will read as a description of a design rather than a report of something that happened.

## If something goes wrong mid-take

- **A page is slow to load.** Keep talking. There is always a sentence you can say about what is coming.
- **You press ▼ twice.** Press ▲ once and carry on. Do not apologise on camera.
- **`npm run prove` shows a red row.** Say the true thing and keep walking: *"that one's a subgraph with no indexer allocated right now — the guard fails closed rather than read it, which is the behaviour I want."* It is a better moment on camera than an all-green table, so do not be thrown by it.
- **You run over 4:00.** Do not upload it. There is no appeal on the length rule and no way to fix it in the edit except cutting a whole beat, which you can do — the eleven replay beats are separate takes as far as the video is concerned.

---

## Never say

- **Never** "it runs in a TEE" about the simulator path. The deployed workflow executes in an enclave; `cre workflow simulate` runs locally. Both are true of this project and they are different sentences.
- Not "two different queries against two different indexers". Same deployment, same selection. The true version is stronger: **same block, same rows, different conclusions.**
- Not "standing decides eligibility". `isEligible` tests the cooldown flag, the stake floor, and whether the ENS record reads at all.
- Do not say the reads are corroborated. **1 of 13** pinned subjects has a genuinely independent second index, and the video does not claim otherwise — keep it that way. The repo and the submission form both state it plainly, which is where a limit belongs when there is no Q&A to volunteer it in.

## Numbers to get right on camera

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

Nothing in this table has to be said out loud. It is here so that if you improvise a number under pressure, you improvise the right one.

Everything that used to live below this — the anticipated questions and the showcase post — moved out when the Q&A session went away. Questions are in `docs/pitch-and-qa.md`, the post is in `docs/partner-posts.md`.

