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

`cre/tribunal/workflow.ts` · sink `0x8f74f7428E045c29F4aF571955CAD21e3a1a2BEe` · Forwarder `0xF8344CFd…4482` (production). `0x15fC6ae9…9F88` is the **simulation mock**, not a second production Forwarder — `supported-chains` lists both and the labels mislead.

**Deployed to the DON, and executing.** Workflow `perjury-tribunal-production`, ID `00a2b49cb8ea5d506cf279fc6feb6b091cab9375efb6b73b88e34db059a81036`, private registry, DON family `zone-a`. Executions run on schedule and succeed: registry read, Confidential HTTP fetch, Vault secrets, adjudication, consensus, `WriteReport`.

**It settles.** Claim 1 on the live registry was adjudicated inside the enclave and written on chain by a DON transmitter through the production Forwarder: [`0xf8dd4d02…c657c5`](https://sepolia.etherscan.io/tx/0xf8dd4d0219ccfd9a723409fbd8d19c88a87c91547c123805e6ff16f3d1c657c5). No simulator involved.

**What blocked it for a day, because it is worth knowing.** The production Forwarder staticcalls `supportsInterface` on a receiver before routing a report. `VerdictSink` did not implement ERC-165 and has no fallback, so that call reverted, the Forwarder recorded the report as failed, and the workflow was told its write succeeded — because the Forwarder's own transaction did succeed. The only trace anywhere is `ReportProcessed(receiver, …, result: false)` in the Forwarder's own logs.

The simulator's mock Forwarder never makes that call. So a receiver can work perfectly under `simulate --broadcast` and never receive a single report on the DON, and nothing warns you. Four lines fixed it, and because the sink's authorised writer is immutable, shipping those four lines cost a full cascade.

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
| `EVMClient` | `callContract` to find the pending claim, and `writeReport` back to Sepolia |

`runtime.usingTheDons()` is the confidentiality boundary. Anything passed to a capability on that runtime executes on Workflow DON nodes. What crosses: the registry read that finds the claim, then the verdict, confidence bucket and commitment hash. What never crosses: evidence, methodology, either derived value.

The registry read crosses deliberately. `callContract` takes a `Runtime` and `TeeRuntime` is not one, and a claim id and status are public values on a public chain, so a node operator watching that request learns only what anyone reading the registry already knows.

### Finding its own work

A deployed workflow carries the config it was built with, so a claim id in that config pins it to one claim forever. `ClaimRegistry.pendingForTribunal()` returns the oldest claim awaiting a verdict and which kind of report it needs, and the evidence URL is a configured base plus that id. One deployment serves every claim there will ever be, including one submitted a minute ago.

Taking the report kind from chain also closed a hazard rather than only enabling a feature: it had been configured as `panel`, and pointing that workflow at a claim nobody appealed would have judged it by the wrong rule and reached a confident wrong verdict.

### Four things the simulator cannot catch

None reproduces locally, and together they cost most of two days.

1. **A receiver must implement ERC-165.** The mock Forwarder does not staticcall `supportsInterface`; the real one does, and a receiver without it silently receives nothing.
2. **`writeReport`'s reply must be checked.** The capability call is dispatched eagerly and `.result()` is the only way to learn the outcome, so ignoring it reports a clean execution whatever happened on chain. Require `txStatus === 2`. Note that even `TX_STATUS_SUCCESS` only means the Forwarder's transaction landed, not that the receiver call inside it succeeded.
3. **Secrets live in namespace `main`.** `cre secrets create` files them there; `getSecret({ id })` defaults to `default`. The mismatch surfaces as `relay quorum unreachable: 3 signed responses … need 4`, which reads like a DON outage.
4. **Two `getSecret` calls in one execution fail on the second.** The first succeeds, the second returns the same quorum error. One batched `getSecrets` works.

The first two are invisible because the simulator broadcasts through the mock Forwarder itself. The last two are invisible because it reads secrets from a local env file and never contacts the Vault.

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
address public immutable ALT_REPORT_WRITER;   // the tenant's other Forwarder
function onReport(bytes calldata, bytes calldata report) external {
    if (msg.sender != CRE_REPORT_WRITER && msg.sender != ALT_REPORT_WRITER) revert NotTribunal();
```

Both **measured, not guessed** — read from `cre workflow supported-chains` for this tenant, after a throwaway `ScratchSink` first established that reports arrive from a Forwarder contract rather than the workflow owner's EOA.

Two doors because both addresses are immutable and `ClaimRegistry.verdictSink` locks on its first wiring call. Chainlink runs one Forwarder for DON execution and one for the simulator, so committing to either means betting every future verdict on that execution path continuing to work. Both are Chainlink-operated and scoped to the organisation, so this is the same party arriving by a different door rather than a wider trust assumption. Passing zero for the second collapses back to one.

### Where it is load-bearing

The adjudication rule is public — a TEE reveals its binary. What must stay private is the *inputs*: publish the evidence and methodology and you publish a rubric the next claimant tailors to. CRE is the only component here doing something a server could not, because the key to the evidence never leaves the Vault DON.

**Verify:** `npx tsx scripts/prove-sealed.ts` — envelope on the live gateway, no plaintext field names, wrong key fails, wrong claim id fails, enclave key opens exactly what was archived.

**Limit:** `cre workflow simulate` **runs locally, not in an enclave.** Confidential-DON deploy access requested, not granted. Correct phrasing: *"a confidential workflow with a TEE handler, executed via the simulator."*

---

## 2. Chainlink VRF v2.5

`WitnessRoster` `0x841f3FD732C6740141FeAaFF10875A0F0f51c534` · coordinator `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` · keyHash `0x787d74ca…3677ae` (500 gwei, the only Sepolia lane)

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

**Verify:** read `WitnessDrawn(claimId, witness, seed)` and recompute `seed % agentCount()`. On claim 25 it lands on index 0, which is the claimant, and the walk steps to index 1. `/replay?d=sim&claim=25` replays that walk from the seed — claim 25 is on the Sep 8 cascade, and claim ids restart with each redeploy.

---

## 3. ENS v2

Root `perjury.eth` · subregistry `0x087f2A255b8C989a7A739F40e85123BDf3d49eFb` · resolver `0xcBd795d211Dd40dB392730034B5e68359c9E8534` (Permissioned, via `VerifiableFactory`) · writer `0x8dd1D2f807A4B6F46EcD4994c4BAe0a44eBf9F8A` · reader `0x4a675089228B308564fd31501410d66c2631A071`

Built against the **hackathon deployment only**. `universalResolver` must be overridden (`withHackathonResolver()`); viem/ethers ship a different built-in address and every ENS result silently targets the wrong deployment otherwise.

### The hierarchy, and the mistake it corrected

Each agent holds a real subname of `perjury.eth`, issued from a subname registry deployed through the same factory as the resolver:

```ts
VerifiableFactory.deployProxy(userRegistryImpl, salt, initialize([{ account, roleBitmap }]))
ETHRegistry.setSubregistry(keccak256("perjury"), subregistry)
ETHRegistry.setResolver(keccak256("perjury"), resolver)      // parent points at ours, not the default
subregistry.register(label, agentAddress, 0x0, resolver, roles, expires)
```

Each name is owned by **its agent**, not by us. Standing is written by the tribunal through the resolver's per-key roles, so the name's owner cannot touch it — which is only true if the owner is not the operator either.

This was added on Sep 11 because it was missing, and its absence had gone unnoticed. `perjury.eth` was registered, the resolver was deployed, the records were written and read — but the parent had no subregistry and pointed at the deployment's *default* resolver, so `witness-a.perjury.eth` did not exist in ENS at all. Resolving it through the Universal Resolver reverted. Our own reader worked because it has the resolver's address compiled into it and calls it directly, which is knowing where to look rather than resolving. The ENS explorer said the name did not exist and was correct.

Two lessons worth more than the fix. A resolver holding records about a name says nothing about whether that name exists. And a component that reads its own dependency by hardcoded address will never notice that the rest of the world cannot reach it.

**Verify (this is the check that would have caught it):**

```bash
# through the Universal Resolver — what a third party would do
resolve(dnsEncode("witness-a.perjury.eth"), text(namehash, "com.perjury.agent-standing"))
```

All ten agents return their standing, flag state and address binding. Before the subregistry existed the same call reverted.

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

Reputation outside protocol storage is portable, publicly readable, and survives redeployment. The contracts were redeployed four times during the build, most recently a full cascade on Sep 11, and standing continued from where it was rather than resetting — `operator.perjury.eth` was on 9 before that cascade and went to 10 on the first claim after it.

Publicly readable is the part that only became true on Sep 11. Before the subregistry, the records were readable by anything holding the resolver's address and by nothing else.

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

- **CRE:** deployed to the DON and executing, but `WriteReport` produces no transaction, so every settled verdict came through the simulator. The enclave now verifies both against chain: `keccak256(claimText)` must equal the bonded `claimHash`, and the bundle's witness must be the address the roster assigned. `npx tsx scripts/prove-claim-binding.ts` demonstrates the refusal.
- **VRF:** roster is ten agents, so an accomplice is drawn about one time in ten. Throttled, not eliminated, and n is the whole argument — which is why the roster being open to anyone who can post a stake matters more than today's number.
- **ENS:** ENSIP-25 / -26 records not implemented. `revokeSetterRoles` has no inverse. Subnames expire in a year and nothing renews them.
- **The Graph:** 12 of 13 subjects single-source.
- **Mechanism:** one witness decides an outcome. K-of-N corroboration is the known hole and is not built.
- **Live submission:** `/submit` runs the agents as real processes, so it needs a host with a long-lived process and the repository on disk. It is disabled on the serverless deployment, which says so rather than failing.

## Commands

```bash
npx tsx scripts/prove-sealed.ts         # CRE: evidence store holds ciphertext
npx tsx scripts/prove-claim-binding.ts  # CRE: tribunal refuses a claim that was not bonded
npx tsx scripts/prove-eac.ts            # ENS: two reverts, one success
npx tsx scripts/prove-corroboration.ts  # Graph: indexers disagree → Unverifiable
npx tsx scripts/prove-name-binding.ts   # ENS: refuses a name you were not issued
npx tsx scripts/verify-pinned.ts        # Graph: all 13 pinned deployments, live
npx tsx scripts/archive-evidence.ts     # CRE: recover evidence via the commitment
npx tsx scripts/deploy-subregistry.ts   # ENS: subnames of perjury.eth (simulates unless --write)

cd cre && cre workflow simulate tribunal --target staging-settings --broadcast
cd cre && cre workflow deploy tribunal -T production-settings -e .env   # to the DON
cre execution list perjury-tribunal-production -T production-settings -e .env
npx tsx agents/runner/scene2.ts panel-2   # full path on chain, ~7 min
```
