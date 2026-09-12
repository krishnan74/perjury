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
npm run prove                               # all six proofs, pass/fail table (add -- --fast to skip the two that spend gas)
npx tsx scripts/register-name.ts <label>    # ENS commit-reveal registration
npx tsx scripts/prove-eac.ts                # EAC proof
npx tsx scripts/prove-name-binding.ts       # registration refuses a name you were not issued
npx tsx scripts/deploy-all.ts               # whole deployment cascade, one command
npx tsx scripts/collect-evidence.ts         # rebuild docs/TX_HASHES.md from chain
npx tsx scripts/verify-pinned.ts            # one query pattern vs all pinned deployments — RUN BEFORE RECORDING
npx tsx scripts/prove-corroboration.ts      # independent deployments must agree, else Unverifiable
npx tsx scripts/prove-sealed.ts             # the evidence store holds ciphertext, openable only in the enclave
npx tsx scripts/archive-evidence.ts         # recover past bundles, verified against the on-chain commitment

npx tsx agents/runner/duel.ts honest compound-v3-ethereum   # any pinned subject; no code change per protocol

cd app && npm run dev                       # the site — five routes, ISR against Sepolia + the Gateway

npx tsx agents/runner/scene1.ts operator    # true claim   (~3m45s)
npx tsx agents/runner/scene2.ts panel-1     # false claim + appeal (~6m45s)
npx tsx agents/runner/scene3.ts panel-2 4   # collusion throttle (~5m)
```

Scenes take a claimant argument because scene 2 slashes its claimant — pass a different agent per run rather than redeploying. Scene 3 takes an optional round count.

## Environment

- Root `.env` (gitignored): `OPERATOR_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `GRAPH_STUDIO_KEY`, `VRF_*`. **`OPERATOR_PRIVATE_KEY` has no `0x` prefix** — `cast` tolerates it, `vm.envUint` does not. Forge scripts take the key via `--private-key` after shell-normalising it.
- `cre/.env` (gitignored): `CRE_ETH_PRIVATE_KEY` (64 hex, no `0x`), `PERJURY_COMMITMENT_SALT`, `PERJURY_ENVELOPE_KEY`. The root `.env` holds the matching `PERJURY_ENVELOPE_PUBKEY`, which the agents seal with. Generate both with `npx tsx scripts/new-envelope-key.ts`; rotating makes every sealed bundle unreadable, so it needs `--force`.
- Never print the private key. Derive the address with `cast wallet address --private-key`.

## Live on-chain (Sepolia)

| | |
|---|---|
| Operator | `0xDcbe075a907960951Cd4df379BB21461097eEa91` |
| `perjury.eth` | registered, ENSv2 hackathon deployment |
| `ScratchSink` (probe) | `0xA7355Ac345828Ea003ad6686Be6D9506F9Fb31cF` |
| `ClaimRegistry` | `0x63cf47746B2181E2e64EB4349373c4f8B050c6c3` |
| `WitnessRoster` | `0x841f3FD732C6740141FeAaFF10875A0F0f51c534` (VRF consumer) |
| `PerjuryStandingWriter` | `0x8dd1D2f807A4B6F46EcD4994c4BAe0a44eBf9F8A` |
| `ENSTextStandingReader` | `0x4a675089228B308564fd31501410d66c2631A071` |
| `VerdictSink` | `0x8f74f7428E045c29F4aF571955CAD21e3a1a2BEe` — answers ERC-165, accepts both Forwarders |
| `PerjuryResolver` | `0xcBd795d211Dd40dB392730034B5e68359c9E8534` — EAC configured per-key, operator write revoked |
| `perjury.eth` subregistry | `0x087f2A255b8C989a7A739F40e85123BDf3d49eFb` — issues the agent subnames |
| CRE Forwarder (DON) | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |
| CRE Forwarder (simulator) | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| VRF subscription | owner = operator, roster registered as consumer |
| Agents | 10 real subnames of `perjury.eth`, owned by the agents, all registered and staked |
| Deployed workflow | `perjury-tribunal-production`, private registry, DON family `zone-a` — **ACTIVE, settling verdicts from the enclave** |
| Live site | https://perjury.vercel.app — production tracks `main` |

**Challenge window is 90s, not 30s.** At 30s the appeal in scene 2 raced the window and intermittently reverted `WindowClosed` — the gap between the verdict landing and the appeal being mined is one confirmation. It is a constructor parameter, so changing it means a redeploy.

**Balances:** operator holds the ETH; the four agent wallets each need their own funds to post bonds (`AGENT_1..4_ADDR`). Scene 2's claimant needs 0.01 bond + 0.02 appeal bond of its own — the first run failed on `insufficient funds` because only the operator had been topped up.

## Facts learned the hard way

- **`cre workflow simulate` runs LOCALLY, not in an enclave.** Still true, and still the fast development loop. What changed on Sep 12 is that the DEPLOYED workflow does run in one and settles verdicts from it, so "ran inside an enclave" is now accurate for that path and only that path. Be precise about which one you mean.
- **Two forwarders, and the sink now accepts both.** Confirm them for your own tenant with `cre workflow supported-chains -T staging-settings -e .env` rather than trusting a note. `VerdictSink` takes `CRE_REPORT_WRITER` and `CRE_ALT_REPORT_WRITER`; both are immutable, and passing zero for the second collapses to one door. Committing to a single Forwarder means betting the demo on that execution path, because the registry's pointer at the sink locks on first wiring.
- **CRE reports arrive from a Forwarder, not the workflow owner.** Both addresses are immutable on the sink. `0xF8344CFd…4482` is the production Forwarder on Sepolia; `0x15fC6ae9…9F88` is the **simulation mock**, not a second production one — `cre workflow supported-chains` lists both and the labels mislead.
- **A report receiver MUST implement ERC-165.** The production Forwarder staticcalls `supportsInterface` before routing; a contract without it reverts, the Forwarder records the report failed, and the workflow is told the write SUCCEEDED because the Forwarder's own transaction succeeded. The only trace is `ReportProcessed(receiver, …, result: false)` in the Forwarder's logs. **The simulator's mock Forwarder never makes this call**, so a receiver can work perfectly under `simulate --broadcast` and never receive a single report on the DON. Cost a day and a cascade.
- **Always check what `writeReport` returned.** The capability call is dispatched eagerly and `.result()` is the only way to learn the outcome; ignoring it reports a clean execution whatever happened. Require `txStatus === 2`.
- **Two `getSecret` calls in one execution fail on the second.** Batch them into one `getSecrets`. And `cre secrets create` files secrets under namespace `main` while `getSecret` defaults to `default` — the mismatch surfaces as `relay quorum unreachable`, which reads like an outage. Neither reproduces in the simulator, which reads secrets from a local env file.
- **`receiver` in `writeReport` is a hex string**, despite the generated type calling it `bytes`. Base64 is rejected with `Invalid hex string`.
- **A cascade resets claim ids to 1**, so the evidence archive, the gateway index and the shared store are all keyed by registry address. A flat layout silently overwrote a settled claim's evidence the first time this happened. Three cascades exist now and the site reads all of them: live, `?d=sim2` (Sep 11), `?d=sim` (Sep 8).
- **Log reads from a public RPC come back short without erroring.** A wide or unfiltered `getLogs` can answer 200 with a truncated set. Filter per event, keep spans at 5000 blocks, and check the row count against `nextClaimId` — claim ids are sequential, so a gap is always a failed read. A paid endpoint would fix it properly.
- **Node RPCs return log addresses lowercased** and our constants are checksummed. Key any map on `.toLowerCase()` or it matches nothing and every page reads as though the chain were empty.
- **The workflow finds its own claim.** `ClaimRegistry.pendingForTribunal()` returns the oldest claim awaiting a verdict and its report kind, so one deployment serves every claim. The registry read goes through `usingTheDons()` because the EVM capability takes a `Runtime` and `TeeRuntime` is not one — the claim id is public, so nothing is lost.
- **Deploy access is enabled.** `cre account link-key` costs a small amount of real **mainnet** ETH, and workflows target the Chainlink-hosted `private` registry (set `deployment-registry` in `workflow.yaml`) rather than the on-chain mainnet one. Vault DON secrets need an interactive browser sign-in: `cre secrets create secrets.yaml -T staging-settings -e .env --secrets-auth browser`.
- **The tribunal re-validates provenance itself** (`provenanceOk` in both `packages/tribunal` and `cre/tribunal/workflow.ts`). The allowlist comes from config, generated from `pinned-deployments.json` by `deploy-all.ts` — if you pin a new deployment, redeploy or regenerate the config or the tribunal will reject honest evidence from it. A missing policy accepts NOTHING, deliberately.
- **Claim and verification are pinned to one block.** The claimant records `atBlock`; the witness, tribunal and appeal path replay against that same block. `composeDocument(selection, atBlock)` injects `block: {number: N}` into `_meta` and the root field, and the guard requires the served block to equal the requested one. **Staleness is deliberately not checked on a pinned read** — the pin is the freshness contract. Without this, a metric that legitimately moved between the two reads looked like a mismatch.
- **Tolerances are seconds, not blocks.** 50 blocks is 10 minutes on Ethereum and 12 seconds on Arbitrum; a healthy Arbitrum deployment 149 blocks behind was failing hard. Freshness and tribunal skew are both expressed in seconds and converted per chain, so every assertion carries its `chain`.
- **A TEE reveals the workflow binary.** Only *data* is confidential (Vault DON secrets, Confidential HTTP payloads, intermediates). `docs/design.md` §3.4 says what is actually true; do not re-inflate the claim.
- **ENSv2 reads go through ENSIP-10 `resolve(bytes dnsName, bytes data)`.** `text(bytes32,string)` and `text(bytes,string)` both REVERT on a factory-deployed Permissioned Resolver. Writes use `setText(bytes dnsName, ...)`. Two contracts shipped a direct `text()` call and reverted on-chain while unit tests passed; the mock now reverts on `text()` to match production.
- **Root-resource EAC grants use `grantRootRoles` / `revokeRootRoles` / `hasRootRoles`.** `grantRoles(resource, ...)` reverts for the root resource. A root grant also satisfies `hasRoles` on every child resource, so revoking a resource-scoped grant does not change what a root holder can do.
- **EAC resources are `uint256`, not `bytes32`.** `IEnhancedAccessControl` types every resource as uint256 even though it holds a keccak256 hash. The bytes32 form encodes identically but has a different selector, so the call reverts with empty data — which read as "the role is absent". `prove-eac.ts` reported every forbidden-role check as passing for days on the strength of that. Use `textResourceId(key)`, not `textResource(key)`, for anything that goes into a contract call. Only `hasRootRoles` is exposed on the deployed resolver until you fix the type; `roles`, `roleCount` and `hasAssignees` revert the same way.
- **A resolver holding records about a name says nothing about whether that name exists.** Until Sep 11 the agent subnames were text-record keys in our own resolver and nothing more: `perjury.eth` had no subregistry and pointed at the deployment's default resolver, so resolving `witness-a.perjury.eth` through the Universal Resolver reverted. Our reader worked only because the resolver address is compiled into it. **Verify ENS work through `universalResolver.resolve()`, never through your own reader.** `npx tsx scripts/deploy-subregistry.ts` (simulates unless `--write`).
- **Issue agent subnames with `AGENT_SUBNAME_ROLES` (RENEW only).** Granting more hands the agent `SET_RESOLVER` on its own name, which lets it repoint at a resolver it controls and write its own standing — `FORBIDDEN_AGENT_REGISTRY_ROLES` names the four. `scripts/fix-agent-roles.ts` checks and repairs.
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
| `/replay` | A settled claim played back from its own transactions. Real hashes, real gaps; the elapsed counter always shows true elapsed time even when playback is sped up. `?d=sim2` and `?d=sim` read the older cascades. |
| `/submit` | Post a real claim and watch it settle. Six short steps the browser drives, agents running in-process, password-gated with a single-flight lock. |
| `/api/evidence/[claimId]` | The sealed bundle, as the enclave fetches it. Public, because it is ciphertext and the enclave carries no credentials. `POST` records where a claim's evidence went, bearer-authenticated. |
| `/api/claim` | One step of a claim per request. |
| `/api/evidence/[claimId]` | The sealed bundle, as the enclave fetches it. Public, because it is ciphertext and the enclave carries no credentials. |

**Deployed at https://perjury.vercel.app**, production tracking `main`. Pages that read live state render per request; the rest is ISR at 30s against Sepolia and the Gateway.

Submitting a claim needs five credentials beyond the read-only set: an agent key, `GRAPH_STUDIO_KEY`, `ANTHROPIC_API_KEY`, `PERJURY_ENVELOPE_PUBKEY`, `GITHUB_GIST_TOKEN`. Missing any and the page says so instead of failing — but only to someone holding `PERJURY_SUBMIT_PASSWORD`, since telling a stranger which credential is absent is a free leak.

**Vercel defaults new env vars to Secret, which hides them from the build.** Use `--no-sensitive`. This broke two deployments before it was spotted.

UI notes worth not relearning: reveal animations are gated on `@media (scripting: enabled)`, never a JS-injected class on `<html>` — that caused a hydration mismatch. `.wrap` uses `padding-block` so `.section` cannot reset the horizontal gutter. Chrome headless enforces a ~500px minimum layout viewport, so "390px" screenshots are lying to you.

## Remaining

1. **Demo video** — **2:00–4:00** (there is a minimum), human voice, ≥720p, no TTS, no speed-up, no phone, intro under 20s. Editing out the VRF waits is expected; speeding footage up is prohibited. Nothing on-chain is blocking it. Before the take: run `scripts/verify-pinned.ts` and top up the wallets. **Use `/replay?d=sim&claim=25`** — claim 25 is on the Sep 8 cascade and the plain URL reads the live one.
2. **Submission form** — copy drafted in `docs/ethglobal-submission.md` (gitignored). Three partner slots: Chainlink, ENS, The Graph.
3. **Human-written limitations section** — the last unmet reserved component in `docs/ai-usage.md` §0.6.
4. ~~Deploy the site~~ — done, https://perjury.vercel.app.
5. **ENS follow-up** — `revokeSetterRoles` has no working inverse once the admin role is given up. Not yet posted.
6. ~~Open gap: gateway storage not encrypted at rest.~~ **Closed Sep 10** — bundles are sealed to the tribunal's key before publishing, the Vault DON releases the private half into the enclave alone, and the envelope is bound to its claim id. `npx tsx scripts/prove-sealed.ts`. [ADR 0010](docs/decisions.md).

7. **Chainlink follow-up** — drafted in `docs/chainlink-reply.md` (gitignored), not yet posted. Reports the ERC-165 root cause as ours and suggests the mock Forwarder make the same check.

**Enclave execution works.** Deploy access arrived Sep 11, and since Sep 12 the deployed workflow adjudicates inside an AWS Nitro enclave on the DON and writes the verdict on chain through the production Forwarder. Claim 1 on the live registry settled that way: `0xf8dd4d0219ccfd9a723409fbd8d19c88a87c91547c123805e6ff16f3d1c657c5`.

The simulator still works against the same contracts and is the faster loop for development. Say "a confidential workflow with a TEE handler" for the simulator path, and "executed in an enclave on the DON" only for the deployed one — the distinction is now real in both directions.
