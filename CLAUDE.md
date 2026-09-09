# Perjury — working notes for Claude

Verification protocol for AI agent claims. Bonded claim → randomly assigned peer witness → private TEE adjudication → ENS reputation that only the tribunal can write.

**Deadline: Sun Sep 13 2026, 12:00 EDT.** Read [`plan.md`](plan.md) first — it opens with a status table, what is live on-chain, and what is blocked.

## Working agreements

- **Ask before every `git commit`.** Show the diff and proposed message; the user reviews first.
- **No `Co-Authored-By` / `Claude-Session` trailers.** Decided Sep 7 — AI involvement is documented in `docs/ai-usage.md`, not as a repo contributor.
- **Commit at the granularity of a change, not a step.** One commit = a small feature, a complete fix, or a docs update — never every intermediate edit, and never a week of work in one blob (large single commits risk disqualification under the event rules). A fix that spans several files is still one commit: shipping half of one is how the ENSIP-10 reader was corrected while the writer's identical bug went out unnoticed. Keep docs changes separate from code.
- Attribution lives in `docs/ai-usage.md` only, never in source file headers.
- **Never hard-wrap prose in markdown.** One paragraph or bullet = one line, however long. Editors soft-wrap; hard wraps break when text is edited, and paste badly into Discord and forms. Applies to every `.md` in the repo.
- **Keep `docs/feedback/*` current as the build progresses.** Add friction as it is hit, while the detail is fresh. Rules: only what we experienced first-hand, or clearly attributed when relayed; record what worked as well as what didn't; every item needs evidence (error text, tx hash, or the design change it forced) and a concrete suggestion. Never pad it to look thorough.
- `WitnessRoster.sol` was reviewed line by line by the user on Sep 9 and is now labelled **AI-ASSISTED**. Its known bound (`MAX_WALK = 32`) is recorded in `docs/threat-audit.md`. Do not edit the file without saying so — the contracts are deployed, and even a comment change makes the local source differ from the bytecode on chain.

## Toolchain — not on PATH by default

```bash
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$HOME/.cre/bin:$PATH"
```

## Commands

```bash
forge test                              # 60 Solidity tests
npx vitest run                          # 89 TS tests
npx tsc --noEmit -p tsconfig.json       # root typecheck (cre/ is excluded, has its own)
cd cre/tribunal && npx tsc --noEmit     # workflow typecheck

cd cre && cre workflow simulate tribunal --target staging-settings [--broadcast]
npx tsx scripts/register-name.ts <label>    # ENS commit-reveal registration
npx tsx scripts/prove-eac.ts                # EAC proof
npx tsx scripts/prove-name-binding.ts       # registration refuses a name you were not issued
npx tsx scripts/deploy-all.ts               # whole deployment cascade, one command
npx tsx scripts/collect-evidence.ts         # rebuild docs/TX_HASHES.md from chain
npx tsx scripts/verify-pinned.ts            # one query pattern vs all pinned deployments — RUN BEFORE RECORDING
npx tsx scripts/prove-corroboration.ts      # independent deployments must agree, else Unverifiable

npx tsx agents/runner/duel.ts honest compound-v3-ethereum   # any pinned subject; no code change per protocol

cd app && npm run dev                       # the site — five routes, ISR against Sepolia + the Gateway

npx tsx agents/runner/scene1.ts operator    # true claim   (~3m45s)
npx tsx agents/runner/scene2.ts panel-1     # false claim + appeal (~6m45s)
npx tsx agents/runner/scene3.ts panel-2 4   # collusion throttle (~5m)
```

Scenes take a claimant argument because scene 2 slashes its claimant — pass a different agent per run rather than redeploying. Scene 3 takes an optional round count.

## Environment

- Root `.env` (gitignored): `OPERATOR_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `GRAPH_STUDIO_KEY`, `VRF_*`. **`OPERATOR_PRIVATE_KEY` has no `0x` prefix** — `cast` tolerates it, `vm.envUint` does not. Forge scripts take the key via `--private-key` after shell-normalising it.
- `cre/.env` (gitignored): `CRE_ETH_PRIVATE_KEY` (64 hex, no `0x`), `PERJURY_COMMITMENT_SALT`.
- Never print the private key. Derive the address with `cast wallet address --private-key`.

## Live on-chain (Sepolia)

| | |
|---|---|
| Operator | `0xDcbe075a907960951Cd4df379BB21461097eEa91` |
| `perjury.eth` | registered, ENSv2 hackathon deployment |
| `ScratchSink` (probe) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` |
| `ClaimRegistry` | `0x8CDa96E615E96f97073C19Cc2167E4D242487A88` |
| `WitnessRoster` | `0x1b686Decd5fc0F5Bd2511E6B63809c340dec2252` (VRF consumer) |
| `PerjuryStandingWriter` | `0x211C7ff47436D43f90f0d8D90e02bf76a6F70BAD` |
| `ENSTextStandingReader` | `0x366D0415347b3F996DbDC8549EdFf6f3Ee616C55` |
| `VerdictSink` | `0xedABb806dDFe7ACa46707713E2D649f2dd0d86D3` (mock forwarder) |
| `PerjuryResolver` | `0xcBd795d211Dd40dB392730034B5e68359c9E8534` — EAC configured per-key, operator write revoked |
| CRE report writer | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` — a **Forwarder**, measured |
| VRF subscription | owner = operator, roster registered as consumer |
| Agents | 5 subnames of `perjury.eth`, all registered and staked |

**Challenge window is 90s, not 30s.** At 30s the appeal in scene 2 raced the window and intermittently reverted `WindowClosed` — the gap between the verdict landing and the appeal being mined is one confirmation. It is a constructor parameter, so changing it means a redeploy.

**Balances:** operator holds the ETH; the four agent wallets each need their own funds to post bonds (`AGENT_1..4_ADDR`). Scene 2's claimant needs 0.01 bond + 0.02 appeal bond of its own — the first run failed on `insufficient funds` because only the operator had been topped up.

## Facts learned the hard way

- **`cre workflow simulate` runs LOCALLY, not in an enclave** (Chainlink, Sep 8). We register a real TEE handler via `cre.handlerInTee`, but simulation does not execute in a TEE. Say "confidential workflow with a TEE handler, executed via the simulator" — never "ran inside an enclave". This matters for the demo video.
- **Two forwarders.** Simulation uses the mock `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`; production uses `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`. Deploy `VerdictSink` with whichever matches the environment.
- **CRE reports arrive from a Forwarder, not the workflow owner.** `VerdictSink.CRE_REPORT_WRITER` is immutable, so this was measured, not guessed. Unknown whether the address is stable across runs — this is why the protocol is not deployed yet.
- **The tribunal re-validates provenance itself** (`provenanceOk` in both `packages/tribunal` and `cre/tribunal/workflow.ts`). The allowlist comes from config, generated from `pinned-deployments.json` by `deploy-all.ts` — if you pin a new deployment, redeploy or regenerate the config or the tribunal will reject honest evidence from it. A missing policy accepts NOTHING, deliberately.
- **Claim and verification are pinned to one block.** The claimant records `atBlock`; the witness, tribunal and appeal path replay against that same block. `composeDocument(selection, atBlock)` injects `block: {number: N}` into `_meta` and the root field, and the guard requires the served block to equal the requested one. **Staleness is deliberately not checked on a pinned read** — the pin is the freshness contract. Without this, a metric that legitimately moved between the two reads looked like a mismatch.
- **Tolerances are seconds, not blocks.** 50 blocks is 10 minutes on Ethereum and 12 seconds on Arbitrum; a healthy Arbitrum deployment 149 blocks behind was failing hard. Freshness and tribunal skew are both expressed in seconds and converted per chain, so every assertion carries its `chain`.
- **A TEE reveals the workflow binary.** Only *data* is confidential (Vault DON secrets, Confidential HTTP payloads, intermediates). `docs/design.md` §3.4 says what is actually true; do not re-inflate the claim.
- **ENSv2 reads go through ENSIP-10 `resolve(bytes dnsName, bytes data)`.** `text(bytes32,string)` and `text(bytes,string)` both REVERT on a factory-deployed Permissioned Resolver. Writes use `setText(bytes dnsName, ...)`. Two contracts shipped a direct `text()` call and reverted on-chain while unit tests passed; the mock now reverts on `text()` to match production.
- **Root-resource EAC grants use `grantRootRoles` / `revokeRootRoles` / `hasRootRoles`.** `grantRoles(resource, ...)` reverts for the root resource.
- **Resolver deployment:** `VerifiableFactory.deployProxy(impl, salt, initData)` where initData is `initialize((address,uint256)[] grants, bytes[] calls)`. Grants land on ROOT_RESOURCE. Break the resolver/writer circularity by granting the operator `SET_TEXT | SET_TEXT_ADMIN` at deployment, then granting the writer and revoking the operator's own write.
- **Subgraph MCP parameters are snake_case** (`ipfs_hash`), not camelCase.
- **`cre.handlerInTee(trigger, fn, [{tee:'nitro', regions:['us-west-2']}])`**, handler is synchronous. `btoa` does not exist in the WASM runtime — use `hexToBase64(toHex(...))`.
- **`EVMClient` takes a bigint CCIP chain selector**, not a chain name.
- MockUSDC has a public `mint(address,uint256)` — no faucet or app needed.
- **VRF v2.5 uses `uint256` subscription ids and a struct request**, not v2's `uint64` + positional args. Sepolia coordinator `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`, keyHash `0x787d74ca…3677ae` (500 gwei, the only lane).
- **Always deploy with `forge script --slow`.** A parallel broadcast hit an RPC in-flight limit, half the contracts silently didn't deploy, and the one-time `wireRegistry` then locked a roster to a codeless address permanently. `DeployCore.s.sol` now requires `code.length > 0` before wiring.

## Layout

```
contracts/     Foundry. 4 protocol contracts + ScratchSink probe + Deploy scripts
cre/           CRE project (project.yaml, secrets.yaml, tribunal/)
packages/      shared · graph-guard · graph-client · mcp-client · tribunal · ens
agents/        claimant · witness · runner (duel + the three scenes)
app/           Next.js 15 site — landing/pitch deck, claims, roster, replay
scripts/       deploy-all · register-name · prove-eac · prove-name-binding · prove-corroboration · verify-pinned · collect-evidence
docs/          design.md · decisions.md · ai-usage.md · build-log.md · threat-audit.md · for-reviewers.md · replay-plan.md · TX_HASHES.md
```

Gitignored working docs (local only): `docs/tracks.md`, `docs/sponsor-questions.md`, `docs/ens-discord-message.md`, `docs/chainlink-discord-message.md`, `docs/cre-access-form.md`, `docs/ethglobal-submission.md`, `docs/pitch-and-qa.md`, `docs/feedback-session-1.md`, `discord-*.md`.

## Status — the protocol is live

The full cascade is deployed and all three demo scenes have run end to end on Sepolia. Proven on-chain: VRF assignment with witness ≠ claimant, settlement in both directions, ENS standing written only by the tribunal, per-key EAC scoping, the complete appeal path (claimant lied → caught → appealed → panel of 3 upheld → lost bond, appeal bond, stake, eligibility, standing −3), and automatic exclusion in the block after settlement. Hashes in [`docs/TX_HASHES.md`](docs/TX_HASHES.md).

Redeploying is a **cascade** — each contract holds the next immutably, so changing one means redeploying everything downstream and re-registering the agents. `npx tsx scripts/deploy-all.ts` does the whole thing in one command (~4 min). Do not hand-run the steps; a partial deploy once locked a roster to a codeless address permanently.

## The site

`app/` — Next.js 15 App Router, five routes, built on the `dashboard` branch and merged to `main` at `d55e0c8`. **Do not delete the `dashboard` branch.**

| Route | What it is |
|---|---|
| `/` | Six sections, theoretical → technical. This doubles as the pitch deck; there is no separate deck, and the video is narrated off this page. |
| `/claims`, `/claims/[id]` | Claim feed and detail, with the "what the tribunal did NOT publish" panel. |
| `/roster` | Who may be drawn and why the excluded agent isn't — read through the same ENS reader the VRF callback uses, never a cache. |
| `/replay` | A settled claim played back from its own transactions. Real hashes, real gaps; the elapsed counter always shows true elapsed time even when playback is sped up. |

Read-only. Live triggering from the browser was deliberately deferred. **`/replay` is the next piece of UI work** — it is honest but renders the mechanism as a bullet list; the rebuild is specced in `docs/replay-plan.md` and is buildable from chain data alone up to Tier B. Every route is `revalidate = 30` ISR against Sepolia and the Gateway — deployment needs the same env the runners use. **Not deployed yet**, and the copy tells judges the site is live, so deploy before submitting.

UI notes worth not relearning: reveal animations are gated on `@media (scripting: enabled)`, never a JS-injected class on `<html>` — that caused a hydration mismatch. `.wrap` uses `padding-block` so `.section` cannot reset the horizontal gutter. Chrome headless enforces a ~500px minimum layout viewport, so "390px" screenshots are lying to you.

## Remaining

1. **Demo video** — **2:00–4:00** (there is a minimum), human voice, ≥720p, no TTS, no speed-up, no phone, intro under 20s. Editing out the VRF waits is expected; speeding footage up is prohibited. Nothing on-chain is blocking it. Before the take: run `scripts/verify-pinned.ts`, top up the operator and the four agent wallets, and re-run all three scenes.
2. **Submission form** — copy drafted in `docs/ethglobal-submission.md` (gitignored). Three partner slots: Chainlink, ENS, The Graph.
3. **Human-written limitations section** — the last unmet reserved component in `docs/ai-usage.md` §0.6.
4. **Deploy the site.**
5. **ENS follow-up** — `revokeSetterRoles` has no working inverse once the admin role is given up. Not yet posted.
6. **Open gap:** gateway evidence storage is confidential in transport but the store itself is a secret gist, not encrypted at rest. Documented, not hidden.

Enclave execution still requires confidential-DON deploy access (requested, not received). The simulator path is the shipping path.
