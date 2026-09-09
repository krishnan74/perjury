# Replay — making the protocol visible

> **Status: planned, not built.** This is the spec for the next work session on `app/src/app/replay/`. Everything in [Tier A](#tier-a--chain-data-only) can be built from data already on chain. [Tier B](#tier-b--needs-the-evidence-archive) needs one small change to `publish-evidence.ts` first.

## The problem

`/replay` currently renders a settled claim as a **vertical list of stage names** with tx links and real gaps. It is accurate and it is honest, and it communicates almost nothing. A viewer sees `Tribunal returned a verdict` and has no idea that two AI agents independently wrote different GraphQL queries against different indexers and arrived at the same number, which is the entire thesis of the project.

The goal is not more chrome. It is that somebody who has never heard of Perjury watches the replay once and can explain the mechanism back to you.

## The shape

Two lanes and a sealed middle:

```
CLAIMANT lane          │  ON-CHAIN spine   │          WITNESS lane
                       │                   │
reads Graph @ block N ─┤  claim + bond     │
                       │  VRF draws  ──────┼──> witness assigned
                       │                   │  reads Graph @ block N
         ( the two lanes never touch — that is the point )
                ╲                                 ╱
                 ╲────────  [ SEALED ]  ─────────╱
                              │
                      verdict + confidence, nothing else
                              │
                  settlement → ENS standing drops → excluded
```

Two lanes that never meet is not decoration, it is the anti-collusion claim drawn in space. The box in the middle stays **opaque on purpose** — we are not showing what happens inside the enclave, and refusing to is more honest and reads better than a fake x-ray. What the animation shows is the *boundary*: two full inputs going in, one thin thing coming out.

## Tier A — chain data only

Buildable immediately from `claimEvents()` / `claimsIndex()` in `app/src/lib/perjury.ts` and `rosterSnapshot()` in `app/src/lib/roster.ts`. No new data sources.

### A1. Two-lane timeline

Replace the single `.stages` column with claimant lane / centre spine / witness lane. Events map to lanes by which address they concern; protocol events (`ClaimSubmitted`, `WitnessAssigned`, `VerdictRecorded`, `Settled`) sit on the spine.

The lanes must be **visibly parallel and visibly unconnected** — no arrow, no line, nothing crossing between them at any point before the seal. If a viewer's eye can trace a path from one lane to the other, the layout is lying about the mechanism.

Collapses to a single column under ~900px, with each step tagged by lane.

### A2. VRF as visible chance

`WitnessAssigned` is currently one line of text, so "randomly assigned" has to be taken on faith. Instead: show all registered agents from `rosterSnapshot()`, grey the claimant out first (structurally excluded — `_assign` skips `cand == claimant`), then let the draw land on one, with the real request and fulfil tx hashes attached.

Agents excluded for standing should be visibly excluded here too, for the same reason — it is the ENS mechanism doing work on camera.

### A3. The sealing beat

On convergence, both lanes' contents move into the box, redact using the existing `.redacted` treatment, and the box closes. Only `verdict + confidence` emerges below it.

Beside the box, dimmed and explicitly labelled: **what did not cross out.** The claim detail page already carries this as a static panel (`.col-sealed` / `.col-published` in `app/src/app/claims/[id]/page.tsx`); here it should happen *in time*, which is what makes it land. Reuse `Redacted.tsx`.

Non-negotiable, inherited from the existing component: redaction bars stay **empty CSS-sized elements with an `aria-label`**. Never invented placeholder strings. We tore those out once already.

### A4. The appeal fork

Scene 2 is the best scene and its most dramatic moment is currently a single line reading `PanelSeated`. The spine should **fork into three parallel lanes** which then vote, and visibly re-converge into `PanelUpheld` / `PanelOverturned`. Panel members come from `appealOf(claimId).panel`.

### A5. Standing bars that move

Listed as cut in [`plan.md`](../plan.md) T6; it is the ENS payoff and it is currently invisible. On `Settled`, the loser's standing bar drops below the eligibility threshold line and their roster row flips to `excluded`.

This is the emotional close of the whole story — *the punishment is that nobody will let you judge anymore* — and it costs one animated bar.

### A6. Scrub bar

Replace play/pause/step with a horizontal time axis carrying real durations, draggable, with the beats marked. For recording you want to jump to the interesting eight seconds, not sit through a ninety-second challenge window in real time.

### A7. Narration line per beat

One sentence of plain English under each step, so the page carries itself when a judge opens it without you talking over it, and so the video needs less voiceover.

## Tier B — needs the evidence archive

### B0. Archive the bundle *(prerequisite for everything below)*

**Nothing about the agents' work survives a scene today.** `publish-evidence.ts` builds an `EvidenceBundle` — each agent's query, deployment ID, block, `queryHash`, raw result, derived value, methodology string — hands it to `publishBundle()`, and the **next run overwrites the gist**. The chain keeps only `claimHash` and `evidenceCommitment`, which are hashes: they prove the evidence existed, they do not show it.

Fix: alongside `publishBundle(bundle)`, write `evidence-archive/<claimId>.json` and commit it. One `writeFileSync` next to the existing call.

**Decide before doing this.** Writing the bundle to a public file after settlement is a deliberate disclosure and should be recorded as a decision in [`decisions.md`](decisions.md), not slipped in. The argument for: confidentiality is a property of the *adjudication window*, not of eternity, and a verdict nobody can audit afterwards is worth less than one they can. The argument against: the project uses the word "sealed" a great deal and a reviewer should not have to work out which sense we mean. Whichever way it goes, say so on the page.

### B1. The two queries, side by side

**This is the money shot and it is completely absent today.** Two different GraphQL documents, composed independently by two LLM agents, against different deployment IDs, arriving at the same number. Show them in the lanes as they are written, with the differing lines marked.

Nothing else on the site makes the case as directly. A viewer who sees this understands in one glance both what corroboration means and why an RPC cannot offer it.

### B2. The number line

Retire the words `Match` / `Mismatch` as the primary signal and plot the two derived values against the tolerance band. Inside the band is a match; scene 2's fabricated claim sits visibly outside it. A number line is understood in about half a second, where a verdict word has to be explained.

Keep the word as a label — it is what the contract stores — but let the geometry carry the meaning.

### B3. The pinned block, shown once

Both lanes stamped with the same block height, sourced from the attestation. It is the answer to the most common sceptical question — *how do you know they were even looking at the same thing* — and it is one line of type.

## Rules this must not break

- **The elapsed counter always shows true elapsed time**, at any playback speed. The current component gets this right and it stays right. A demo of a verification protocol that misrepresents its own timing defeats itself.
- **Missing data says so.** A claim with no archived bundle renders `evidence not archived for this claim`, never a plausible-looking box. Same rule that killed the fake redaction placeholders.
- **Nothing is animated into existence that did not happen.** Every beat traces to a transaction or an archived artifact.
- **Honour `prefers-reduced-motion`** — offer the finished state, not the choreography.
- **Reveal gating stays on `@media (scripting: enabled)`.** Do not reintroduce a JS-injected class on `<html>`; that caused the hydration mismatch.
- Use the existing tokens: `--expo` / `--quart` easing, `--accent` for the single emphasis per beat, `--match` / `--mismatch` / `--unverifiable` for verdict colour. No new palette.

## Suggested order

`A1 → A2 → A3 → A5` is the coherent minimum: two lanes, a visible draw, the sealing beat, and the standing drop. That tells the whole story from chain data alone and is enough to record against.

Then `B0 → B1 → B2` if there is time, which adds the strongest single piece of evidence the project has.

`A4`, `A6`, `A7`, `B3` are additive and can be dropped without leaving a hole.
