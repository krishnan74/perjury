# Developer feedback — ENSv2

From building Perjury (ETHOnline 2026). Our design depends on a property ENSv2's Enhanced Access Control is unusually well suited to provide: **an agent must not be able to write its own reputation record — only a TEE tribunal may.** So we spent our time on EAC scoping, permissioned resolvers, and direct-to-contract registration rather than on resolution.

Written to be useful rather than polite.

---

## What worked well

- **Direct-to-contract registration is clean.** Once we had the `ETHRegistrar` ABI, commit-reveal was straightforward: `makeCommitment` → `commit` → wait `MIN_COMMITMENT_AGE` → `approve` → `register`. `getRegisterPrice` returning `(base, premium)` separately is a nice touch.
- **The team is fast and candid in Discord.** Confirming that the app is "just a convenience layer" and that contracts are the real interface unblocked several teams quickly, including us.
- **Per-record permissions are the right primitive.** Being able to say "this contract may write exactly this one text key and nothing else" is precisely what a reputation system needs, and we couldn't have built this honestly on ENSv1's fuses.
- **MockUSDC has a public `mint(address,uint256)`.** This saved us entirely when the registration app was failing — worth documenting deliberately rather than leaving teams to discover it.

---

## 1. EAC resource derivation is powerful but easy to miss *(highest impact)*

The Permissioned Resolver docs contain one sentence that changes how you design an entire permission model:

> "resolver resources are derived from the setter argument alone. Names play no part in resource computation."

For a text record that means `resource = keccak256(bytes(key))`. We had designed around **node-scoped** roles and had to revise our architecture and documentation once we understood this. The implication — that a grant on a shared resolver applies to that key for *every* name on it — has direct consequences for whether you need one resolver per subject.

**Suggestion.** Give this its own callout block with a worked example, e.g. "granting `ROLE_SET_TEXT` for `com.example.score` on a resolver authorises that key for all names served by that resolver — use a resolver per subject if you need per-subject isolation." It is currently a sentence inside a paragraph, and it is the most consequential sentence on the page.

## 2. Role constants live on contract pages, not the EAC page

The Enhanced Access Control page explains bitmaps, admin roles at `role << 128`, and `grantRoles`/`revokeRoles`/`hasRoles` — but says role identifiers require "reviewing individual contract pages". We had to go to the Permissioned Resolver page for `ROLE_SET_TEXT = 1 << 4` and its siblings.

**Suggestion.** A consolidated table on the EAC page listing every role across registry and resolver with its value and scope. When designing permissions, what you most want is to see the whole space at once — especially to reason about what you are *not* granting.

## 3. `setText` takes a DNS-encoded name; reads take a namehash

This asymmetry surprised us. `setText(bytes name, string key, string value)` wants DNS wire format, while `text(bytes32 node, string key)` wants a namehash. Our contract interface was written with `bytes32` for both — it compiled, tests passed against our mock, and it would have reverted on the first real write.

**Suggestion.** Call the asymmetry out explicitly in the resolver docs, and note that a contract integrating both directions needs to store both forms per name. We now store `ensNode` and `dnsName` side by side.

## 4. The registry/resolver permission split isn't stated up front

We spent a day designing around the assumption that registering a name grants the owner resolver roles, and planned an elaborate "revoke the owner's own `ROLE_SET_TEXT`" step. The ENS team clarified that registration grants **registry** roles only (`SET_RESOLVER`, `SET_SUBREGISTRY`, `TRANSFER_ADMIN`), that resolvers are a separate permission world, and that resolver roles are supplied to the **VerifiableFactory at deployment time** as `(account, roleBitmap)` pairs.

Once stated, this is simpler and stronger than what we'd designed — there is nothing to revoke, because the agent never had the permission. But nothing in the docs we read led us there.

**Suggestion.** State the split explicitly and early: "registration grants registry roles; resolver permissions are set when you deploy a resolver through the factory, and are not derived from name ownership." A diagram of the two permission worlds would save teams a design iteration. We wrote our §4.2 twice before getting it right.

## 5. ⚠ `SET_RESOLVER` is a bypass of every resolver-level restriction *(the most valuable thing we learned)*

The ENS team flagged something we had not considered: when issuing subnames, granting the holder `SET_RESOLVER` lets them **point the name at a different resolver entirely** — one they control — making any carefully scoped resolver permission irrelevant.

For our project that is a complete bypass of the central security property. And it is easy to miss precisely because you spend your design time in the *resolver* permission world, while the bypass lives in the *registry* one.

**Suggestion.** Add a security note wherever subname issuance is documented: "withholding `SET_RESOLVER` is required if you rely on resolver-level permissions; a holder with `SET_RESOLVER` can repoint the name and write anything." This deserves a callout box rather than a line in a role table — it is the kind of thing that turns a correct-looking permission model into a decorative one.

## 6. The Permissioned Resolver serves reads only through ENSIP-10 `resolve()`

Both `text(bytes32,string)` and `text(bytes,string)` revert on a factory-deployed Permissioned Resolver. Reads work through `resolve(bytes dnsName, bytes data)` — the ENSIP-10 wildcard interface — with the inner call ABI-encoded.

We wrote a contract that reads a text record directly, which is the obvious shape and matches how ENSv1 resolvers behave. It compiled, it passed against our mock, and on-chain it reverted. In our case the caller catches read failures and treats an unreadable record as ineligible, so the symptom would have been every agent silently becoming ineligible and every assignment failing closed — a protocol that quietly refuses to work rather than one that errors.

**Suggestion.** State on the Permissioned Resolver page that reads are served via `resolve()` and that direct `text()` calls revert, with a short contract-to-contract read example. The write path (`setText`, DNS-encoded name) is documented; the read path is the half a contract integrator actually needs first, and the asymmetry between them is genuinely surprising.

## 7. Per-key scoping works, but is undiscoverable from the docs — and has no obvious inverse

Deployment-time grants land on the root resource, so a writer granted `ROLE_SET_TEXT` at
initialisation can write *every* text key on that resolver. For us that mattered: the entire claim is
that our tribunal can write one field and nothing else.

The ENS team supplied the pattern immediately — hold `ROLE_SET_TEXT_ADMIN` at init, then one
multicall of `grantSetterRoles("setText call with key X", writer)`, then
`revokeRootRoles(ROLE_SET_TEXT_ADMIN, deployer)`. It works exactly as described, and we verified it
on-chain: the same account writes `com.perjury.agent-standing` successfully and is refused `avatar`.

Two things would have saved us the round trip:

- **The pattern deserves to be a documented recipe.** "Grant narrowly to a contract, then give up the
  ability to change it" is likely to be what most people building on EAC actually want, and it is not
  derivable from the reference pages — `grantSetterRoles` is documented, but not that init grants are
  root-only, so nothing signals that the extra step is necessary.
- **The inverse is not straightforward.** The team confirmed the revoke path is `revokeRoles`,
  requiring that you still hold `ROLE_SET_TEXT_ADMIN`. We do hold it at root — `hasRootRoles` returns
  true — and the resource is confirmed to be `keccak256(key)`, since the `EACUnauthorizedAccountRoles`
  revert on an unauthorised write reports exactly that value. `revokeRoles(keccak256(key), 1<<4,
  account)` nonetheless reverts for a grant issued via `grantSetterRoles`.

  Our reading is that root admin does not authorise revoking a *resource-scoped* grant, and that
  `grantSetterRoles` does not leave the granter with admin at that resource. If that is right, a
  setter-scoped grant is effectively one-way unless you deliberately take admin at each resource
  first — worth stating plainly, because the natural mental model is that holding the admin role lets
  you undo what you granted.

## 8. Verifying a per-key grant is harder than making one

Having applied the pattern in item 7, we wanted a script that asserts it — a judge should be able to check "the tribunal holds `SET_TEXT` on this key and nothing else" rather than take it on faith. Two things made that harder than expected, and both produced a *silent wrong answer* rather than an error.

First, `IEnhancedAccessControl` types every resource as `uint256`, while the rest of ENS speaks `bytes32` and the resource itself is a keccak256 hash. We called `hasRoles(bytes32,uint256,address)`. Same 32 bytes on the wire, different function selector, so the call reverted with empty return data. Our script had been reporting the tribunal's forbidden roles as "correctly absent" for days — every one of those checks was a reverting call, and a proof that cannot execute proves nothing.

Second, the deployed Permissioned Resolver exposes `hasRootRoles` but not the per-resource views. `hasRoles`, `roles`, `roleCount` and `hasAssignees` are all in the interface and all revert on the deployment; only after fixing the type did the per-resource query start working, which means the interface and the deployment did agree and the type was the whole problem. We spent an hour probing selectors because a bare revert cannot distinguish "wrong function" from "not exposed".

**Suggestion.** Two small things. State the `uint256` resource type prominently on the EAC page, ideally with a one-line note that it is a hash used as an integer — it reads as a typo until you find the interface. And have the resolver revert with a named error rather than empty data on an unknown selector, so an integrator gets "no such function" instead of a blank. A worked "assert your grants" snippet alongside the grant recipe would close the loop, since the grant is the easy half.

## 9. Answered, and worth writing down

Two questions we couldn't answer from the docs, both answered quickly in the channel:

- **Unauthorized `setText` reverts** with `EACUnauthorizedAccountRoles`. It does not silently no-op. This determines how anyone writes tests and demos against EAC, and belongs in the resolver docs.
- **A contract can hold EAC roles exactly as an EOA can.** Obvious in hindsight, but the whole write path of any protocol-controlled record depends on it, and it isn't stated.

## 10. The registration app blocked teams, and the channel was the only signal

We did **not** hit this ourselves — but only because we read the channel first. Multiple teams reported the "Deploy resolver" step failing with `gas limit too high (cap: 16777216, tx: 21000000)` across three separate RPC providers, plus a malformed `initialize` payload. Registration is the very first thing any project does, so absent that warning we would have spent hours there before suspecting the app rather than our own setup.

The team's response was fast and correct — the app is a convenience layer, register against the contracts — and direct-to-contract worked cleanly for us. But that guidance lived in a Discord thread, not in the docs or in the app itself.

**Suggestion.** When a known-broken path exists during an event, a banner in the app saying "resolver deploy is currently failing, register directly against the contracts — see docs" would reach every team rather than the ones reading the channel at the right moment. A hardcoded 21M gas limit above what most providers accept is also worth a fix regardless.

## 11. Hackathon deployment domains trip wallet warnings

The deployment is served from `*.workers.dev` and `*.pages.dev`, and MetaMask flagged the app domain as potentially malicious when we went to open it. Very likely a domain-reputation false positive on the shared subdomain rather than anything wrong with the deployment — but it is hard to verify independently, and it made us stop before connecting a wallet.

It matters beyond the app: the contract addresses we build against come from a `*.pages.dev` docs preview too, and a team that can't establish the domain is genuinely ENS's has no easy way to confirm those addresses. We ended up verifying them behaviourally on-chain instead — checking each address had code, that the registrar answered `isAvailable`, and that MockUSDC reported the expected symbol and decimals. Serving both from an `ens.domains` subdomain would remove the doubt entirely.

---

## The Permissioned Resolver has no address records at all

We wanted registration to prove that an agent controls the name it binds its reputation to, and the idiomatic answer is forward resolution: read the name's `addr` and require it to equal the caller.

It is not available. The Permissioned Resolver implementation at `0xa9d3814ab151bf6e37a427432795371a8361614e` contains no `addr(bytes32)`, no `addr(bytes32,uint256)`, and no `setAddr` in any form — we scanned the deployed bytecode for every selector shape rather than guess, having already been caught once by assuming `text(bytes32,string)` would work. `setText(bytes,string,string)` is there; nothing address-shaped is.

`ROLE_SET_ADDRESS` exists in the role enum, which is what sent us looking, so the role is defined for a capability the implementation does not have.

**Consequences for us.** We fell back to an issuance text record written by the namespace operator, scoped to its own EAC key. That works and it is arguably the right trust model for a namespace issuing its own subnames — but it proves issuance rather than ownership, which is a weaker statement, and every consumer has to agree on a bespoke key rather than reading a standard record.

**Suggestions.** Either implement `addr`/`setAddr` on the Permissioned Resolver, or state plainly in its documentation that it is text-only and that `ROLE_SET_ADDRESS` is inert. The second costs nothing and would have saved us the detour. More broadly: a documented way to answer "does this name belong to this address" on-chain is the primitive that anything binding reputation or permissions to a name needs first, and right now that question has no standard answer on this deployment.

**A related one-way door.** Roles are supplied to the VerifiableFactory at resolver deployment, and a role not taken then cannot be acquired later. Our first resolver was deployed without `SET_ADDRESS`, so even if the implementation had supported addresses we could never have written one without redeploying and re-pointing every name. Worth a prominent warning next to the deployment snippet: **take every role you might ever need at deployment, because there is no later.**

---

