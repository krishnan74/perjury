# Perjury — working notes for Claude

Verification protocol for AI agent claims. Bonded claim → randomly assigned peer witness →
private TEE adjudication → ENS reputation that only the tribunal can write.

**Deadline: Sun Sep 13 2026, 12:00 EDT.** Read [`plan.md`](plan.md) first — it opens with a status
table, what is live on-chain, and what is blocked.

## Working agreements

- **Ask before every `git commit`.** Show the diff and proposed message; the user reviews first.
- **No `Co-Authored-By` / `Claude-Session` trailers.** Decided Sep 7 — AI involvement is documented
  in `docs/ai-usage.md`, not as a repo contributor.
- **Commit incrementally.** Large single commits risk disqualification under the event rules.
- Attribution lives in `docs/ai-usage.md` only, never in source file headers.
- **Keep `docs/feedback/*` current as the build progresses.** Add friction as it is hit, while the
  detail is fresh. Rules: only what we experienced first-hand, or clearly attributed when relayed;
  record what worked as well as what didn't; every item needs evidence (error text, tx hash, or the
  design change it forced) and a concrete suggestion. Never pad it to look thorough.
- `WitnessRoster.sol` is labelled **AI-ASSISTED — ⚠ NOT YET HUMAN-LED**. It is the anti-collusion
  claim and the user reserved it for their own review. Do not relabel it.

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

- Root `.env` (gitignored): `OPERATOR_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `GRAPH_STUDIO_KEY`,
  `VRF_*`. **`OPERATOR_PRIVATE_KEY` has no `0x` prefix** — `cast` tolerates it, `vm.envUint` does
  not. Forge scripts take the key via `--private-key` after shell-normalising it.
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
| `VerdictSink` | **not deployed** — waiting on Forwarder answer |
| CRE report writer | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` — a **Forwarder**, measured |
| VRF subscription | 10 LINK, owner = operator, 0 consumers |

## Facts learned the hard way

- **CRE reports arrive from a Forwarder, not the workflow owner.** `VerdictSink.CRE_REPORT_WRITER`
  is immutable, so this was measured, not guessed. Unknown whether the address is stable across runs
  — this is why the protocol is not deployed yet.
- **A TEE reveals the workflow binary.** Only *data* is confidential (Vault DON secrets, Confidential
  HTTP payloads, intermediates). `docs/design.md` §3.4 says what is actually true; do not re-inflate
  the claim.
- **ENSv2 `setText` takes a DNS-encoded name**, not a namehash. Reads use namehash.
- **Subgraph MCP parameters are snake_case** (`ipfs_hash`), not camelCase.
- **`cre.handlerInTee(trigger, fn, [{tee:'nitro', regions:['us-west-2']}])`**, handler is
  synchronous. `btoa` does not exist in the WASM runtime — use `hexToBase64(toHex(...))`.
- **`EVMClient` takes a bigint CCIP chain selector**, not a chain name.
- MockUSDC has a public `mint(address,uint256)` — no faucet or app needed.
- **VRF v2.5 uses `uint256` subscription ids and a struct request**, not v2's `uint64` + positional
  args. Sepolia coordinator `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`, keyHash
  `0x787d74ca…3677ae` (500 gwei, the only lane).
- **Always deploy with `forge script --slow`.** A parallel broadcast hit an RPC in-flight limit,
  half the contracts silently didn't deploy, and the one-time `wireRegistry` then locked a roster to
  a codeless address permanently. `DeployCore.s.sol` now requires `code.length > 0` before wiring.

## Layout

```
contracts/     Foundry. 4 protocol contracts + ScratchSink probe + Deploy scripts
cre/           CRE project (project.yaml, secrets.yaml, tribunal/)
packages/      shared · graph-guard · graph-client · mcp-client · tribunal · ens
scripts/       register-name.ts · prove-eac.ts
docs/          design.md · decisions.md · ai-usage.md · build-log.md · TX_HASHES.md
```

Gitignored working docs (local only): `docs/tracks.md`, `docs/sponsor-questions.md`,
`docs/ens-discord-message.md`, `docs/cre-access-form.md`, `discord-*.md`.

## Blocked on

1. `ANTHROPIC_API_KEY` → the witness/claimant agents, last piece of T5
2. ENS answers (posted Sep 8) → EAC grants, subnames, `prove-eac.ts` shape
3. Chainlink Forwarder stability → protocol deploy, then live VRF

Next unblocked work: **T6 dashboard** — no credentials needed, reads from chain and Graph.
