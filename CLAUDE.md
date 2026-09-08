# Perjury — working notes for Claude

Verification protocol for AI agent claims. Bonded claim → randomly assigned peer witness → private TEE adjudication → ENS reputation that only the tribunal can write.

**Deadline: Sun Sep 13 2026, 12:00 EDT.** Read [`plan.md`](plan.md) first — it opens with a status table, what is live on-chain, and what is blocked.

## Working agreements

- **Ask before every `git commit`.** Show the diff and proposed message; the user reviews first.
- **No `Co-Authored-By` / `Claude-Session` trailers.** Decided Sep 7 — AI involvement is documented in `docs/ai-usage.md`, not as a repo contributor.
- **Commit incrementally.** Large single commits risk disqualification under the event rules.
- Attribution lives in `docs/ai-usage.md` only, never in source file headers.
- **Never hard-wrap prose in markdown.** One paragraph or bullet = one line, however long. Editors soft-wrap; hard wraps break when text is edited, and paste badly into Discord and forms. Applies to every `.md` in the repo.
- **Keep `docs/feedback/*` current as the build progresses.** Add friction as it is hit, while the detail is fresh. Rules: only what we experienced first-hand, or clearly attributed when relayed; record what worked as well as what didn't; every item needs evidence (error text, tx hash, or the design change it forced) and a concrete suggestion. Never pad it to look thorough.
- `WitnessRoster.sol` is labelled **AI-ASSISTED — ⚠ NOT YET HUMAN-LED**. It is the anti-collusion claim and the user reserved it for their own review. Do not relabel it.

## Toolchain — not on PATH by default

```bash
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$HOME/.cre/bin:$PATH"
```

## Commands

```bash
forge test                              # 28 Solidity tests
npx vitest run                          # 35 TS tests
npx tsc --noEmit -p tsconfig.json       # root typecheck (cre/ is excluded, has its own)
cd cre/tribunal && npx tsc --noEmit     # workflow typecheck

cd cre && cre workflow simulate tribunal --target staging-settings [--broadcast]
npx tsx scripts/register-name.ts <label>    # ENS commit-reveal registration
npx tsx scripts/prove-eac.ts                # EAC proof — written, never run
```

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
| `ClaimRegistry` | `0x2e36eA21cFf463095dE7E24d7a6F540b9F41a0e3` |
| `WitnessRoster` | `0xebC374Bf77dA3ca15e0A2A35Ec610638A684c867` (VRF consumer) |
| `PerjuryStandingWriter` | `0xF2928c22Bb3951E891f76D166EbD1102f4888e9d` |
| `ENSTextStandingReader` | `0x5bBd6E1D6F361F044cF8799F990c05681D3A80c5` |
| `VerdictSink` | `0xa0EE246F2ADc5206668bB55C2cF6b311219B7ac5` (mock forwarder) |
| `PerjuryResolver` | `0x033ee97dde610f134a746f986fa60c54588a0a45` — EAC configured, operator write revoked |

⚠ **The deployed registry/roster/writer/sink predate the ENSIP-10 read fix in `PerjuryStandingWriter` and must be redeployed** — see "Next step" below.
| CRE report writer | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` — a **Forwarder**, measured |
| VRF subscription | 10 LINK, owner = operator, 0 consumers |

## Facts learned the hard way

- **`cre workflow simulate` runs LOCALLY, not in an enclave** (Chainlink, Sep 8). We register a real TEE handler via `cre.handlerInTee`, but simulation does not execute in a TEE. Say "confidential workflow with a TEE handler, executed via the simulator" — never "ran inside an enclave". This matters for the demo video.
- **Two forwarders.** Simulation uses the mock `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`; production uses `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`. Deploy `VerdictSink` with whichever matches the environment.
- **CRE reports arrive from a Forwarder, not the workflow owner.** `VerdictSink.CRE_REPORT_WRITER` is immutable, so this was measured, not guessed. Unknown whether the address is stable across runs — this is why the protocol is not deployed yet.
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
scripts/       register-name.ts · prove-eac.ts
docs/          design.md · decisions.md · ai-usage.md · build-log.md · TX_HASHES.md
```

Gitignored working docs (local only): `docs/tracks.md`, `docs/sponsor-questions.md`, `docs/ens-discord-message.md`, `docs/cre-access-form.md`, `discord-*.md`.

## Next step — redeploy the settlement path

`PerjuryStandingWriter` was fixed to read via `resolve()` after deployment, so the on-chain stack is stale. Because each contract holds the next immutably (or its wiring is one-time), the cascade is:

1. `DeployCore.s.sol` — redeploys reader, roster, registry, writer. Keep the existing resolver `0x033ee97d…`.
2. `npx tsx scripts/configure-eac.ts` — grant the NEW writer `SET_TEXT`. The operator still holds `SET_TEXT_ADMIN`, so this works; its own `SET_TEXT` is already revoked.
3. `DeploySink.s.sol` — deploys `VerdictSink` and wires registry + writer.
4. Add the new roster as a VRF consumer; register both agents using the real namehashes (`operator.perjury.eth` = `0x83625a4d…`, `witness-a.perjury.eth` = `0xad74ee3e…`) with their DNS-encoded names.
5. Submit a claim, wait ~2 min for VRF, then `cd cre && cre workflow simulate tribunal --target staging-settings --broadcast`.

Verify settlement: claim status becomes `Settled`, `withdrawable` moves to claimant or witness, and the ENS standing record changes.

## Blocked on

1. `ANTHROPIC_API_KEY` → the witness/claimant agents, last piece of T5
2. ENS answers (posted Sep 8) → EAC grants, subnames, `prove-eac.ts` shape
3. Chainlink Forwarder stability → protocol deploy, then live VRF

Next unblocked work: **T6 dashboard** — no credentials needed, reads from chain and Graph.
