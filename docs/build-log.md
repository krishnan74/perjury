# Build Log

Short dated notes. Append-only.

---

**Sep 7 — planning.** Wrote the project brief. Researched sponsor requirements; two findings changed the plan: CRE Confidential Workflows is invite-only private beta (→ simulate-first, [ADR 0002](decisions.md)), and the deadline is **Sep 13, 12:00 EDT** — six days, not the open-ended window the brief assumed. Also: large single commits risk disqualification, and only 3 partner-prize slots exist. Decided VRF for assignment, Next.js dashboard, LLM agents over scripted queries.

**Sep 7 — T2 + contract half of T3.** Repo pushed. Four contracts compiling, 28 tests passing (1024 fuzz runs). The negatives are the point: verdicts from an EOA or the deployer revert, assignment is unreachable except through the VRF callback, agents can't write their own standing. `test_collusionIsThrottledNotEliminated` asserts both directions — accomplice drawn well under 2/3 of the time, and strictly more than zero.

**Sep 7 — graph-guard + tribunal logic.** npm workspaces up. `graph-guard` enforces deployment-ID pinning and freshness with no path that degrades into a pass (13 tests). Tribunal adjudication written as a pure function so it's testable without an enclave (14 tests) — including leak tests asserting no evidence, methodology, or disputed value appears in the serialized report. CRE wrapper written but **not run**; SDK registration API unconfirmed until access lands.

**Sep 7 — CRE gate removed.** Access is an official Google Form, not a Discord thread, and the docs confirm the local simulator runs confidential workflows *without* approval. T1 was never actually blocked; the risk ranking overstated it. Downgraded from highest risk to medium.

**Sep 7 — T1 RUNS.** CRE CLI v1.32.0 + Bun installed, logged in (org_QgykQWgrYIfOqRSQ, deploy access not enabled). Scaffolded the real `hello-confidential-workflows-ts` template, rewrote `cre/` to match it, and the Perjury tribunal now simulates end-to-end inside a TEE handler: `verdict=1 confidence=high` on two independently-derived values agreeing within tolerance. Confirms Darby's answer — no beta grant needed to simulate.

Three of my guesses were wrong: the handler is `cre.handlerInTee(trigger, fn, [{tee:'nitro', regions:['us-west-2']}])` and synchronous, not async; `btoa` doesn't exist in the WASM runtime (`hexToBase64(toHex(...))`); and the confidentiality claim in design §3.4 was overstated — the workflow binary, including the adjudication rule, is revealed to the enclave. Only the *data* is confidential. Rewrote §3.4; the honest version is a stronger story (public rule, sealed evidence, public verdict).

Blocked on credentials: T4 (ENSv2), T5 live Graph + agents, T6 (dashboard). Outstanding: `WitnessRoster` still needs the human review reserved in [ai-usage.md](ai-usage.md) §0.6.

---

## Session end — Sep 8

**Working:** contracts (28 tests), tribunal in a TEE handler, live Graph reads through the guard, Subgraph MCP client, `perjury.eth` registered. 63 tests green, both typechecks clean.

**Three things I got wrong today**, all caught before they cost anything: the CRE report sender is a Forwarder not the workflow owner (would have bricked every verdict, since the address is immutable); the confidentiality claim in design §3.4 overstated what a TEE protects (the binary is revealed, only data is confidential); and ENSv2 `setText` takes a DNS-encoded name, not a namehash — which would have compiled fine and reverted on the first real write.

**Sent Sep 8:** ENS questions posted in the Discord channel (self-write revocation, revert-vs-no-op, contract-held EAC roles, per-agent resolvers, cheap on-chain text reads). CRE Confidential Workflows access form submitted — the workflow already simulates, so the request is only to move to live deployment on the confidential DON plus Vault DON secrets. Neither blocks work that can proceed without them.

**To resume:** `plan.md` → Status at a glance. Next unblocked task is the dashboard; everything else waits on `ANTHROPIC_API_KEY`, the ENS answers, or the Chainlink Forwarder question.
