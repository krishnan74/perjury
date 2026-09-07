# Build Log

Dated notes as the build progresses. Append-only; entries are not edited after the fact, including
the ones that record mistakes.

Format: what got done, what broke, what changed as a result. Milestone exits also record the
attribution pass (see [ai-usage.md](ai-usage.md) §0.7).

---

## 2026-09-07 — Planning

- Wrote the project brief (`prompts/01-project-brief.md`) — mechanism, threat model, sponsor
  targeting, three demo scenarios. No AI involvement in the design itself.
- Directed Claude Code to research sponsor track requirements and turn the brief into an
  architecture + milestone plan. Two things came back that changed the plan:
  - Chainlink Confidential Workflows is **invite-only private beta** — so the tribunal, the single
    most important component, sits behind an external gate. Led to
    [ADR 0002](decisions.md).
  - The Graph has a **second** $5k track (Composable/Standardized Graph Products) we'd already
    qualify for. Logged as an open question — need to confirm dual-submission rules.
- Made four architectural calls: VRF for assignment, simulate-first CRE, Next.js dashboard, LLM
  agents over scripted queries. Written up as ADRs 0001–0004.
- Read ETHGlobal's AI usage policy, then restructured the docs around it: committed prompts, per-file
  provenance convention, living attribution table. [ADR 0005](decisions.md).
- Split the monolithic plan into this docs tree.

- Checked the event details page. Three findings that reshaped the plan more than any design
  decision did:
  1. **Deadline is Sun Sep 13, 12:00 EDT — six days, not "time is available."** Re-gated every task
     to hard dates and added a cut order.
  2. **"Large single commits or missing histories may be disqualified."** Commit incrementally from
     today; the docs tree is the first commit.
  3. **Only 3 partner prize slots.** Settles the dual-Graph-track question — there's one Graph slot.
- Borrowed structure from a previous hackathon repo: task-level plan with checkboxes and time-boxes,
  a global-constraints block, `TX_HASHES.md` as a running evidence ledger, and `FEEDBACK.md` for
  sponsor developer notes. Added a prior-art chapter.

- Repo initialized. Split the docs into six commits rather than one — the rules warn that large
  single commits or missing histories risk disqualification, so the history starts as it should
  continue. Decided against `Co-Authored-By` trailers: AI involvement is documented in `ai-usage.md`,
  which is where a reviewer can actually read it, rather than as a bot contributor.

**Status:** no code yet, by choice. T0 (repo init + dependency smoke tests) is next, starting with the
CRE beta access request.

**Open:** two questions block T1's interface freeze — claim domain, and where sealed evidence blobs
live. See [`../plan.md`](../plan.md).

---

## 2026-09-07 (later) — T2 + contract half of T3

- Repo created and pushed: github.com/krishnan74/perjury
- Foundry toolchain installed; four contracts written and compiling under 0.8.26.
- 28 tests pass (1024 fuzz runs). The ones that matter are the negatives: a verdict
  from an EOA or the deployer reverts, `rawFulfillRandomWords` from anyone but the
  coordinator reverts, and an agent cannot write its own standing record.
- Two test bugs of my own, both caught by the suite rather than by reading: an invalid
  hex literal `0xCRE`, and an absolute-balance assertion that ignored payouts alice had
  already earned as a witness. Contract logic was right in both cases.
- `test_collusionIsThrottledNotEliminated` asserts BOTH directions on purpose — the
  accomplice is drawn well under 2/3 of the time, and strictly more than zero. The
  second assertion is the honest limitation encoded as a test rather than a caveat.
- **Not done, needs live credentials:** CRE workflow (T1), real VRF wiring, ENSv2
  registration and EAC grants (T4), Graph layer and agents (T5), dashboard (T6).
- **Outstanding:** WitnessRoster is still labelled AI-ASSISTED. Per ai-usage §0.6 it
  needs a line-by-line human pass before it can be called HUMAN-LED.

<!-- Next entry template:

## YYYY-MM-DD — <milestone or topic>

- What got done.
- What broke, and what it cost.
- What changed in the plan as a result.

**Attribution pass:** <files added, provenance confirmed/corrected, decisions appended>

-->
