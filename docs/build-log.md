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

## Session pause — Sep 8, midday

**Working:** contracts (28 tests), tribunal in a TEE handler, live Graph reads through the guard, Subgraph MCP client, `perjury.eth` registered. 63 tests green, both typechecks clean.

**Three things I got wrong today**, all caught before they cost anything: the CRE report sender is a Forwarder not the workflow owner (would have bricked every verdict, since the address is immutable); the confidentiality claim in design §3.4 overstated what a TEE protects (the binary is revealed, only data is confidential); and ENSv2 `setText` takes a DNS-encoded name, not a namehash — which would have compiled fine and reverted on the first real write.

**Sent Sep 8:** ENS questions posted in the Discord channel (self-write revocation, revert-vs-no-op, contract-held EAC roles, per-agent resolvers, cheap on-chain text reads). CRE Confidential Workflows access form submitted — the workflow already simulates, so the request is only to move to live deployment on the confidential DON plus Vault DON secrets. Neither blocks work that can proceed without them.

**To resume:** `plan.md` → Status at a glance. Next unblocked task is the dashboard; everything else waits on `ANTHROPIC_API_KEY`, the ENS answers, or the Chainlink Forwarder question.

---

## Sep 8 — the protocol went live

**Deployed the whole cascade.** Each contract holds the next immutably, so a change to one means redeploying everything downstream and re-registering the agents. Doing that by hand took fifteen minutes and once locked a roster permanently to a codeless address — an RPC in-flight limit meant two contracts silently didn't deploy and the one-time wiring call succeeded against nothing. `DeployCore.s.sol` now requires `code.length > 0` before wiring, everything deploys with `--slow`, and `scripts/deploy-all.ts` does the entire cascade in about four minutes.

**The lying-witness hole.** A question about the mechanism — what if the witness feeds the tribunal evidence designed to force a Mismatch, since it profits from one — turned out to be a real, exploitable incentive. Three changes closed it: the witness fee is paid on *every* verdict including Match, so the fee is never a reward for finding fault; the forfeited bond is payable to **nobody**, because paying it to the witness is exactly what makes manufacturing disagreement profitable; and the tribunal now recomputes both sides from raw evidence with an asymmetric rule, so a claimant whose evidence contradicts its own stated value is a Mismatch while a witness in the same position is merely Unverifiable. [ADR 0007](decisions.md).

That prompted a systematic audit rather than waiting to be asked again — [threat-audit.md](threat-audit.md), nine findings, all now closed: timeouts on both sides, eligibility checked at submit, reputation reads that fail closed, a block-skew guard, and the appeal layer.

**The appeal layer, proven on-chain.** A losing claimant posts an appeal bond; a second VRF draw seats three agents excluding both parties; majority stands. Settlement had to be split out of `recordPanelVerdict` into a permissionless `finalize()` — the Forwarder's gas allowance could not cover an ENS write plus a slash, and the report was being swallowed with `success=false` in its event.

**Things that were wrong and got caught.** ENSv2 reads must go through ENSIP-10 `resolve()`; `text()` reverts on a Permissioned Resolver. Two contracts shipped the direct call and the mock served `text()` happily, so tests passed while production reverted. The mock now reverts to match. Also: VRF v2.5 uses a `uint256` subscription id and a struct request, and a "VRF outage" turned out to be our own subscription balance — 500 gwei × 500k gas reserves ~72 LINK against the 10 we held. `callbackGasLimit` cut to 150k after measuring the real callback at ~90k.

## Sep 9 — all three scenes, and two sponsor-track rethinks

**Scenes 1, 2 and 3 ran end to end on Sepolia** — 3m46s, 6m46s, 4m53s. Scene 2 is the whole thesis in one story: a claimant asserted 64.70% against a live 40.43%, was caught by an agent it could not choose, appealed, drew a panel that excluded both parties, and lost its bond, appeal bond, stake and eligibility. Scene 3 had never actually run: it read the round count from the argv slot the claimant name occupies, got `NaN`, ran zero rounds, and still printed its finale as though it had passed.

Transaction hashes are now rebuilt from chain by `scripts/collect-evidence.ts` rather than transcribed from terminal output, which prints them truncated.

**Standardized-schema leverage, made demonstrable.** The verification path was already protocol-agnostic — the recompute keys off the Messari schema, not off Aave — and nothing showed it. Pinned Compound III and Spark Lend, which took appending two JSON objects and touched no agent, guard or tribunal code. Both verified immediately. `scripts/verify-pinned.ts` runs one selection set against every pinned deployment and prints the document it used.

**Corroborated reads — the one that changed the mechanism.** A competitive read of the Graph track showed the integration was hygiene-tier: discover through MCP, pin a deployment, reject mismatches. True, and not enough. The rethink landed somewhere better than the two options that preceded it.

A deployment id is a content hash of the *mapping code*, so two deployments of one protocol are two independent derivations of the same chain state. Until now claimant and witness read the same deployment — they re-derived the query while sharing the derivation, which meant a subgraph bug would produce two honest agents agreeing on a wrong number and the protocol settling a Match on it. That was §6's second limitation, previously only disclosed.

Where a protocol has a second independent index, both must now agree or the read returns `Unverifiable`. Divergence is deliberately not resolved to a majority: if independent indexers disagree the fact is contested, and picking a winner invents a fact the data layer does not support. Found a live case immediately — two Morpho Aave V3 deployments, same Messari schema, identical block, 488 bps apart.

The honest limit: only one of five pinned protocols has a second index, so elsewhere the read is stamped `single-source` and the original limitation stands.

**Where it stands.** 55 Solidity tests, 64 TypeScript, both typechecks clean. Every engineering gate met early. The video is unrecorded and is now the only thing that can lose this. `WitnessRoster.sol` still carries its `⚠ NOT YET HUMAN-LED` label, awaiting the line-by-line review reserved for it.
