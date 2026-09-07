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

Blocked on credentials: T1 (CRE), T4 (ENSv2), T5 (Graph + agents), T6 (dashboard).
Outstanding: `WitnessRoster` still needs the human review reserved in [ai-usage.md](ai-usage.md) §0.6.
