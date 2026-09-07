# CRE Tribunal Workflow

The adjudication logic lives in [`packages/tribunal`](../packages/tribunal) as a pure, tested
function. This directory holds only the thin CRE wrapper around it, so the logic can be verified
without an enclave and the wrapper stays small enough to review in one sitting.

**Status:** not yet run. Confidential Workflows is invite-only private beta
([ADR 0002](../docs/decisions.md)). The handler-registration API must be confirmed against the
installed `@chainlink/cre-sdk` before this is trusted.

```
cre workflow simulate --target staging-settings --config cre/config.staging.json --broadcast cre/tribunal/main.ts
```

Record the broadcast transaction's `msg.sender` — it determines whether `VerdictSink`'s immutable
`CRE_REPORT_WRITER` is the workflow owner address or a Chainlink Forwarder. Do not guess it into the
contract.
