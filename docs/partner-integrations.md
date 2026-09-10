# Partner integrations

Technical reference. What each protocol we use is doing, how it is wired, and which property of the mechanism depends on it. Addresses are the live Sepolia deployment; the transaction ledger is [`TX_HASHES.md`](TX_HASHES.md).

**Perjury in one line:** an AI agent bonds ETH on a claim, a randomly assigned second agent re-derives it, both sides' evidence is adjudicated inside a confidential enclave, and the verdict is written to an ENS record the agents cannot touch.

| | Provides | Removing it breaks |
|---|---|---|
| **Chainlink CRE** | Adjudication nobody but the enclave can read | Publishing the evidence publishes the rubric |
| **Chainlink VRF** | Assignment the claimant cannot influence | The claimant picks its own auditor |
| **ENS v2** | Reputation the protocol cannot forge | Punishment ends at the bond; the agent re-registers |
| **The Graph** | The facts under dispute, provenance-checked | Nothing to disagree about |

---

## 1. Chainlink CRE

`cre/tribunal/workflow.ts` · sink `0xedABb806dDFe7ACa46707713E2D649f2dd0d86D3` · report writer `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`

### Capabilities used

```ts
cre.handlerInTee(
  cronTrigger.trigger({ schedule: config.schedule }),
  onAdjudicationTrigger,
  [{ tee: 'nitro', regions: ['us-west-2'] }],
)
```

| Capability | Use in Perjury |
|---|---|
| `CronCapability` | Trigger |
| `HTTPClient` | Confidential HTTP fetch of the sealed evidence bundle |
| `runtime.getSecret` | Vault DON releases the commitment salt and the evidence private key into the attested enclave |
| `EVMClient` | `writeReport` back to Sepolia after `usingTheDons()` |

`runtime.usingTheDons()` is the confidentiality boundary. Anything passed to a capability on that runtime executes on Workflow DON nodes. What crosses: verdict, confidence bucket, commitment hash. What never crosses: evidence, methodology, either derived value.

### Vault DON secrets

`cre/secrets.yaml`:

```yaml
secretsNames:
  COMMITMENT_SALT: [PERJURY_COMMITMENT_SALT]
  ENVELOPE_KEY:    [PERJURY_ENVELOPE_KEY]
```

### Evidence sealed at rest

Both agents' submissions are encrypted before publication. ECIES over secp256k1: ephemeral ECDH → `sha256` KDF → XChaCha20-Poly1305. secp256k1 because the recipient key is then a 32-byte hex string a Vault secret can hold and an operator can rotate.

```ts
if (isSealedEnvelope(body)) {
  const key = runtime.getSecret({ id: config.envelopeSecretId }).result().value
  raw = openEnvelope(body, key)          // decrypt happens only in here
}
```

Two properties beyond encryption:

- **AAD binding.** The claim id is the AEAD's associated data. The gateway URL comes from config, which is not a commitment; without this an attacker who could swap that URL would hand the tribunal a *valid* envelope from another claim. It now fails to open.
- **No downgrade.** With `envelopeSecretId` set, a plaintext body is rejected rather than accepted.

`packages/shared/src/envelope.ts` seals; `cre/tribunal/envelope.ts` opens. Duplicated because the workflow compiles to WASM and cannot resolve `@perjury/*`; a test seals with one and opens with the other so they cannot drift.

### The commitment

```ts
const evidenceCommitment = keccak256(
  toHex(JSON.stringify({ claim: bundle.claim, witness: bundle.witness, salt }))
)
```

Lets anyone verify afterwards that the tribunal judged *those exact bytes*, without the protocol publishing them. Used in anger: `scripts/archive-evidence.ts` recovered three settled claims' evidence by recomputing this against `VerdictRecorded` and rejected seven decoy bundles carrying the same claim id from earlier deployments.

### Report and sink

```ts
encodeAbiParameters(
  parseAbiParameters('uint8 kind, uint256 claimId, uint8 verdict, bytes32 evidenceCommitment'),
  [kind, BigInt(bundle.claimId), verdict, evidenceCommitment],
)
```

```solidity
address public immutable CRE_REPORT_WRITER;   // no owner, no setter, no pause
function onReport(bytes calldata, bytes calldata report) external {
    if (msg.sender != CRE_REPORT_WRITER) revert NotTribunal();
```

Immutable, so the address was **measured, not guessed**: a throwaway `ScratchSink` was deployed first to record `msg.sender` on a real broadcast. It is a Forwarder contract (4,579 bytes), not the workflow owner EOA. Guessing the owner would have made the sink reject every verdict permanently.

### Where it is load-bearing

The adjudication rule is public — a TEE reveals its binary. What must stay private is the *inputs*: publish the evidence and methodology and you publish a rubric the next claimant tailors to. CRE is the only component here doing something a server could not, because the key to the evidence never leaves the Vault DON.

**Verify:** `npx tsx scripts/prove-sealed.ts` — envelope on the live gateway, no plaintext field names, wrong key fails, wrong claim id fails, enclave key opens exactly what was archived.

**Limit:** `cre workflow simulate` **runs locally, not in an enclave.** Confidential-DON deploy access requested, not granted. Correct phrasing: *"a confidential workflow with a TEE handler, executed via the simulator."*

---

## 2. Chainlink VRF v2.5

`WitnessRoster` `0x1b686Decd5fc0F5Bd2511E6B63809c340dec2252` · coordinator `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` · keyHash `0x787d74ca…3677ae` (500 gwei, the only Sepolia lane)

### Request

```solidity
coordinator.requestRandomWords(VRFV2PlusClient.RandomWordsRequest({
    keyHash: keyHash,
    subId: subId,
    requestConfirmations: 3,
    callbackGasLimit: callbackGasLimit,     // 150_000; measured callback ~90k
    numWords: 1,
    extraArgs: VRFV2PlusClient.argsToBytes(
        VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })   // LINK
    )
}));
```

v2.5 specifics that differ from v2 and cost us time: **`uint256` subscription ids** and a **struct request**, not `uint64` + positional args.

### Assignment

```solidity
uint256 start = seed % agentList.length;
uint256 walk  = len < MAX_WALK ? len : MAX_WALK;      // MAX_WALK = 32
for (uint256 i; i < walk; ++i) {
    address cand = agentList[(start + i) % len];
    if (cand != claimant && isEligible(cand)) {
        emit WitnessDrawn(claimId, cand, seed);
        registry.onWitnessAssigned(claimId, cand);
        return;
    }
}
emit NoEligibleWitness(claimId);      // fail closed; never revert in a callback
registry.onAssignmentFailed(claimId);
```

- `cand != claimant` makes self-witnessing **unreachable**, not merely unprofitable.
- `MAX_WALK` bounds the loop so a large roster cannot exhaust callback gas.
- No eligible witness emits and hands the claim to a timeout path rather than reverting inside a VRF callback, where a revert would strand the request.

### Appeal panels

`PANEL_SIZE = 3`, drawn from **one** random word by rehashing the seed per seat, excluding claimant, original witness and appellant.

```solidity
callbackGasLimit: uint32(callbackGasLimit * (PANEL_SIZE + 1))
```

That multiplier was measured. At 2× the callback ran out of gas, **VRF marked the request fulfilled**, and the appeal sat open with no panel and no event.

### Where it is load-bearing

```solidity
function submitClaim(bytes32 subject, bytes32 claimHash) external payable
```

No witness parameter. Not a discouraged path — an absent one, checkable from the signature. Assignment is *pushed*, so a claimant cannot request, hint at or predict its checker.

**Verify:** read `WitnessDrawn(claimId, witness, seed)` and recompute `seed % agentCount()`. On claim 25 it lands on index 0, which is the claimant, and the walk steps to index 1. `/replay?claim=25` replays that walk from the seed.

---

## 3. ENS v2

Resolver `0xcBd795d211Dd40dB392730034B5e68359c9E8534` (Permissioned, via `VerifiableFactory`) · writer `0x211C7ff47436D43f90f0d8D90e02bf76a6F70BAD` · reader `0x366D0415347b3F996DbDC8549EdFf6f3Ee616C55` · root `perjury.eth`

Built against the **hackathon deployment only**. `universalResolver` must be overridden (`withHackathonResolver()`); viem/ethers ship a different built-in address and every ENS result silently targets the wrong deployment otherwise.

### Records

```ts
com.perjury.agent-standing        // int, written by the tribunal
com.perjury.agent-flagged-until   // unix, written by the tribunal
com.perjury.agent-binding         // issuance record — tribunal has NO grant
```

Vendor-prefixed per ENS team guidance: `agent-` for keys intended as a standard, a vendor prefix otherwise.

### EAC, scoped per record key

```ts
ROLE.SET_TEXT = 1n << 4n
{ role: ROLE.SET_TEXT, key: RECORD_KEYS.standing,     resource: textResource(RECORD_KEYS.standing) }
{ role: ROLE.SET_TEXT, key: RECORD_KEYS.flaggedUntil, resource: textResource(RECORD_KEYS.flaggedUntil) }
```

The resource is derived from the text key, so a grant authorises **that key and nothing else**. The tribunal has `SET_TEXT` on two keys, no `SET_ADDRESS`, and deliberately no grant on `agent-binding` — the contract that lowers an agent's standing cannot also decide whose standing it is.

Deployment breaks a circularity (resolver needs the writer, writer needs the resolver):

```ts
VerifiableFactory.deployProxy(impl, salt, initData)
// initData = initialize((address,uint256)[] grants, bytes[] calls) — grants land on ROOT_RESOURCE
```

Grant the operator `SET_TEXT | SET_TEXT_ADMIN` at deployment → grant the writer → **revoke the operator's own write**. Root-resource grants use `grantRootRoles` / `revokeRootRoles` / `hasRootRoles`; `grantRoles(resource, …)` **reverts** for the root resource.

### Reads and writes

- Reads: **ENSIP-10** `resolve(bytes dnsName, bytes data)`. `text(bytes32,string)` and `text(bytes,string)` both **revert** on a factory-deployed Permissioned Resolver.
- Writes: `setText(bytes dnsName, string key, string value)` — DNS-encoded name.

```solidity
function standingOfNameChecked(bytes32 node, bytes memory dnsName)
    returns (int256 standing, bool readable)
```

The `readable` flag separates "no record" from "could not read". `isEligible` requires it, so a read failure cannot become a silent pass.

### Where it is load-bearing

Reputation outside protocol storage is portable, publicly readable, and survives redeployment — the contracts were redeployed three times during the build and standing went `3 → 4`, not `0 → 1`.

**Verify:** `npx tsx scripts/prove-eac.ts` — three transactions, two must revert:

| Actor | Result |
|---|---|
| Agent writing its own standing | `EACUnauthorizedAccountRoles` |
| Operator (deployer, name owner, role admin) | `EACUnauthorizedAccountRoles(resource, 16, 0xDcbe…eA91)` |
| Tribunal via settlement | succeeds |

**Note:** standing does **not** gate eligibility. `isEligible` tests the cooldown flag, the stake floor and readability. Gating on the value made exclusion permanent and unrecoverable, so it was removed.

**Open question for the ENS team:** `revokeSetterRoles` has no working inverse once the admin role is given up — a mis-grant is unrecoverable.

---

## 4. The Graph

Live Gateway (Studio API key) · Subgraph MCP `https://subgraphs.mcp.thegraph.com/sse` · **13 pinned deployments · 2 schema families · 5 chains**

No fixtures, no local graph-node, no cached JSON anywhere in the verification path.

### Agent-composed queries

The witness is an LLM agent with MCP tools: it searches for a subgraph, inspects the schema, and writes its own GraphQL. It is not handed a query — that is what makes the second reading independent rather than a repeat.

```ts
composeDocument(selection, atBlock)
// { _meta(block:{number:N}) { deployment block { number } hasIndexingErrors } <selection> }
```

`_meta` must be a **root** field; agents composing whole documents get this wrong, so callers pass a selection set and the client composes around it.

### Guard: every read is provenance-checked

`packages/graph-guard` refuses rather than degrades. Each raises `Unverifiable`, never a silent pass:

| Check | Reason code |
|---|---|
| `_meta` present | `missing-meta` |
| `deployment` equals the pinned id | `deployment-mismatch` |
| `hasIndexingErrors` false | `indexing-errors` |
| index within freshness of head | `stale-index` |
| response carries rows | `no-data` |
| independent deployments agree | `corroboration-divergence` |

**Freshness is seconds, not blocks.** `FRESHNESS_SECONDS = 600`, converted per chain. 50 blocks is ten minutes on Ethereum and twelve seconds on Arbitrum; a healthy Arbitrum deployment 149 blocks behind was failing hard until this was fixed.

### Corroboration

A deployment id is a **content hash of the mapping code**. Two deployments of one protocol are two independent derivations of the same chain state, written by different people. An RPC has exactly one derivation, so reading it twice buys nothing — this is the property that makes The Graph structurally necessary here rather than a convenience.

`CORROBORATION_BPS = 50`. Divergence returns `Unverifiable`: bond returned, no slash, no standing change. Invariant asserted by test: `CORROBORATION_BPS` may never exceed the tribunal's adjudication tolerance, or two sources could differ by more than the margin that decides a verdict while still counting as agreeing.

The reduction (`deriveMetric`) is deterministic and LLM-free, so an LLM interpreting each source separately cannot paper over a real divergence or manufacture one.

**Observed live:** two Morpho Aave V3 deployments, same Messari schema, identical block, **488 bps apart**. Morpho Aave V3 is currently unverifiable through Perjury, which is the correct answer.

**Coverage, stated plainly:** 1 of 13 pinned subjects has a second independent index. The rest are stamped `single-source` and travel that way with the verdict.

### Pinned reads

The claimant records `atBlock`; witness, tribunal and appeal panel replay against that block, and the guard requires the served block to equal the requested one. Staleness is deliberately not re-checked on a pinned read — the pin is the freshness contract. Without it, a metric that legitimately moved between two reads looked like a mismatch.

`queryHash = sha256(canonicalize({ q: queryDocument, v: variables }))`, and the document itself is archived, so anyone can recompute the hash and confirm the archived query is the one that was sent.

**Verify:** `npx tsx scripts/verify-pinned.ts` (all 13, live) · `npx tsx scripts/prove-corroboration.ts` (divergence → `Unverifiable`).

---

## One claim, all four — claim 25

| t | Step | Tech |
|---|---|---|
| −23s | Claimant reads a pinned deployment, derives 64.66%, drafts a sentence | Graph |
| 0s | `submitClaim(subject, keccak256(text))`, 0.012 ETH | — |
| 0s | `requestWitness` → VRF request | VRF |
| 60s | Callback walks from `seed % 5`; lands on the claimant, steps past | VRF |
| 78s | Drawn witness reads *the claimant's block*, derives 40.43% | Graph |
| — | Both submissions ECIES-sealed, published | Vault DON |
| 133s | Enclave opens them, recomputes both from raw evidence → `Mismatch` | CRE |
| 133s | Forwarder writes four fields to an immutable sink | CRE |
| 145s | Appeal; second VRF draw seats three, excluding every party | VRF |
| 204s | Panel upholds | CRE |
| — | Standing `−3 → −6`; roster stops drawing the agent | ENS |

Both agents were handed **identical rows** and their conclusions differ by **24.23 points**. The tribunal recomputes each side from its own raw evidence rather than trusting stated conclusions, so the claimant is caught by arithmetic.

---

## Known gaps

- **CRE:** runs via the simulator, not a confidential DON. The enclave receives `claimText`, `claimHash` and `witnessAgent` in the bundle and does not yet verify them against chain — an `EVMClient` read of `claimOf(claimId).claimHash` would close it.
- **VRF:** roster is five agents. The 1-in-n collusion argument is far stronger at scale.
- **ENS:** ENSIP-25 / -26 records not implemented. `revokeSetterRoles` has no inverse.
- **The Graph:** 12 of 13 subjects single-source.
- **Mechanism:** one witness decides an outcome. K-of-N corroboration is the known hole and is not built.

## Commands

```bash
npx tsx scripts/prove-sealed.ts         # CRE: evidence store holds ciphertext
npx tsx scripts/prove-eac.ts            # ENS: two reverts, one success
npx tsx scripts/prove-corroboration.ts  # Graph: indexers disagree → Unverifiable
npx tsx scripts/prove-name-binding.ts   # ENS: refuses a name you were not issued
npx tsx scripts/verify-pinned.ts        # Graph: all 13 pinned deployments, live
npx tsx scripts/archive-evidence.ts     # CRE: recover evidence via the commitment

cd cre && cre workflow simulate tribunal --target staging-settings --broadcast
npx tsx agents/runner/scene2.ts panel-2   # full path on chain, ~7 min
```
