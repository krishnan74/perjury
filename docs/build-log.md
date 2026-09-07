# Build Log

Short dated notes. Append-only.

---

**Sep 7 — planning.** Wrote the project brief. Researched sponsor requirements; two findings changed
the plan: CRE Confidential Workflows is invite-only private beta (→ simulate-first,
[ADR 0002](decisions.md)), and the deadline is **Sep 13, 12:00 EDT** — six days, not the open-ended
window the brief assumed. Also: large single commits risk disqualification, and only 3 partner-prize
slots exist. Decided VRF for assignment, Next.js dashboard, LLM agents over scripted queries.

**Sep 7 — T2 + contract half of T3.** Repo pushed. Four contracts compiling, 28 tests passing (1024
fuzz runs). The negatives are the point: verdicts from an EOA or the deployer revert, assignment is
unreachable except through the VRF callback, agents can't write their own standing.
`test_collusionIsThrottledNotEliminated` asserts both directions — accomplice drawn well under 2/3 of
the time, and strictly more than zero.

**Sep 7 — graph-guard + tribunal logic.** npm workspaces up. `graph-guard` enforces deployment-ID
pinning and freshness with no path that degrades into a pass (13 tests). Tribunal adjudication written
as a pure function so it's testable without an enclave (14 tests) — including leak tests asserting no
evidence, methodology, or disputed value appears in the serialized report. CRE wrapper written but
**not run**; SDK registration API unconfirmed until access lands.

**Sep 7 — CRE gate removed.** Access is an official Google Form, not a Discord thread, and the docs
confirm the local simulator runs confidential workflows *without* approval. T1 was never actually
blocked; the risk ranking overstated it. Downgraded from highest risk to medium.

Blocked on credentials: T4 (ENSv2), T5 live Graph + agents, T6 (dashboard).
Outstanding: `WitnessRoster` still needs the human review reserved in [ai-usage.md](ai-usage.md) §0.6.
