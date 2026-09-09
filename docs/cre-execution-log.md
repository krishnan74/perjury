# CRE Confidential Workflow — execution evidence

Evidence for the Chainlink **Best Confidential Workflow** track. Captured by running `cre workflow simulate tribunal --target staging-settings` from `cre/`.

**Scope, stated plainly:** the CRE CLI simulator does not execute in a real enclave, and prints that itself in the banner below. We register a real TEE handler via `cre.handlerInTee` and the simulator confirms the trigger requested TEE execution on AWS Nitro in `us-west-2`. Enclave execution on the CRE network requires deploy access (`cre account access`), which we have requested and not received. We do not claim adjudication has run inside a TEE.

## What runs inside the confidential handler

`cre/tribunal/workflow.ts` registers exactly one handler and it is the tribunal itself — the only thing in the protocol that turns two agents' evidence into a verdict. Remove it and Perjury has no adjudicator.

Sensitive material processed inside the handler, before anything crosses back to the DON:

| | |
|---|---|
| **Vault DON secret** | `runtime.getSecret({ id: 'COMMITMENT_SALT' })` — released into the attested enclave. It binds the evidence commitment so the published hash cannot be brute-forced back to the sealed evidence. |
| **Confidential HTTP response** | Both agents' sealed submissions are fetched inside the enclave. The claimant's and witness's raw evidence, methodology and query hashes never leave it. This is the load-bearing confidentiality: the two parties publish independently and never see each other's work — the bundle is the only place they meet, and it meets inside the handler. |
| **Intermediate values** | Both sides' metric values are **recomputed from raw evidence** inside the handler rather than trusting either party's stated conclusion, then compared within tolerance. Those recomputed values, the degeneracy check and the confidence bucket are all intermediates that stay inside. |

What deliberately crosses back via `runtime.usingTheDons()`: a report kind, a claim id, a verdict enum, and a `bytes32` commitment. Never evidence, methodology, or values.

Note the design intent on what is *not* confidential: the workflow binary is handed to the enclave, so **the adjudication rule is public** — a tribunal whose procedure is secret is not a tribunal. Only the inputs are sealed. See `docs/design.md` §3.4.

## Captured run

```
Initializing...
Loading settings...
Checking RPC connectivity...
Compiling workflow...
✓ Workflow compiled
✓ Simulation limits enabled
  HTTP: req=120kb resp=250kb timeout=10s | ConfHTTP: req=125kb resp=500kb timeout=1m30s | Consensus obs=25kb | ChainWrite evm_report=50kb evm_gas=10000000 solana_report=265b solana_cu=300000 | WASM binary=100mb compressed=20mb
  Binary hash: 6f21fdb3526f962f1d844ef649d9b033a8a96452cc81678b3e68f18ffb6c2932
  Config hash: c51e5c85e493323bb2a8db8e3e7e4eea8996ada9386c74dbbe98f858eabf8a14
2026-09-09T08:06:14Z [SIMULATION] Simulator Initialized

2026-09-09T08:06:14Z [SIMULATION] Running trigger trigger=cron-trigger@1.0.0

╭────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Trigger requested TEE Execution your trigger will run in one of the following Tees:                │
│     - AWS Nitro in us-west-2                                                                       │
│ The simulator is not a real TEE, and is meant to debug.                                            │
│ Do not use it for sensitive information.                                                           │
│ During real execution, user logs for this trigger will not be visible, and will not leave the TEE. │
│ They are presented in the simulator for debugging only.                                            │
│                                                                                                    │
╰────────────────────────────────────────────────────────────────────────────────────────────────────╯

2026-09-09T08:07:00Z [USER LOG] Adjudication complete. verdict=2 confidence=high

✓ Workflow Simulation Result:
"verdict=2 confidence=high"

2026-09-09T08:07:00Z [SIMULATION] Execution finished signal received
2026-09-09T08:07:00Z [SIMULATION] Skipping WorkflowEngineV2

╭──────────────────────────────────────────────────────╮
│ Simulation complete! Ready to deploy your workflow?  │
│                                                      │
│ Run cre account access to request deployment access. │
╰──────────────────────────────────────────────────────╯
```

`verdict=2` is `Mismatch` — this run adjudicated claim 2, the false claim from demo scene 2, in panel mode (the appeal). The claimant asserted 64.70% against a live value of 40.43%.

## On-chain delivery

The same workflow run with `--broadcast` signs a report and delivers it through a Chainlink Forwarder to `VerdictSink`, which accepts exactly one immutable sender address. Report-delivery transactions for every demo scene are in [TX_HASHES.md](TX_HASHES.md) — for example the `Mismatch` verdict for claim 2 at [`0x08bd04a4…`](https://sepolia.etherscan.io/tx/0x08bd04a4c4e04dd2e0920f7170e6cbf94a201558ff9d38d0ee1e40f6fd363aa3) and the panel verdict at [`0xd86effaf…`](https://sepolia.etherscan.io/tx/0xd86effaf3a706f80df7c91e4e3404ca985a4921d72540ec87ed7d6e9bfe6f2e2).

Because `VerdictSink.CRE_REPORT_WRITER` is immutable, the accepted address was **measured** from a real transaction rather than guessed — reports arrive from a Forwarder contract, not the workflow owner EOA. See `docs/decisions.md` ADR 0006.

## Reproducing

```bash
cd cre && cre workflow simulate tribunal --target staging-settings
```

Requires `cre/.env` with `CRE_ETH_PRIVATE_KEY` and `PERJURY_COMMITMENT_SALT`, and a reachable evidence gateway URL in `cre/tribunal/config.staging.json`. `npx tsx agents/runner/publish-evidence.ts` republishes the bundle if the gateway URL has expired.
