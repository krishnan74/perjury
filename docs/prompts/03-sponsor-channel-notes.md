# Notes 03 — ETHOnline Discord sponsor channels

**Date:** 2026-09-07 **Source:** ENS and Chainlink channels, ETHOnline 2026 Discord (pasted by the human). **Why committed:** these are the facts that changed the build, distilled from the sponsor channels. The raw transcripts are kept locally and not committed — they contain other participants' handles, project details, and support identifiers that aren't ours to republish.

---

## Chainlink — what's confirmed

**Darby | Chainlink Labs (Sep 4), answering exactly our question:**
> "yes `cre workflow simulate` will work for confidential workflows. The beta access for hello world confidential is to deploy the workflow to the confidential workflow DON, and secrets to the vault DON."

Two consequences:
1. **Simulation needs no grant.** T1 is unblocked. Confirms [ADR 0002](../decisions.md).
2. **The Vault DON does.** Our design fetches the commitment salt from the Vault DON — that path is gated. Simulation needs a local secret source, with the Vault DON as the live-deploy upgrade.

**Frank Kong | Chainlink Labs, on what qualifies as a meaningful confidential use case:**
> "CRE confidential workflow makes sense when proprietary data, rules, and policies are run and calculated within it."

Perjury fits directly: each agent's methodology and evidence are proprietary, and publishing them would hand future claimants a rubric to game. Worth echoing this framing in the submission.

**Auth:** if the dashboard shows no API-key button, use `cre login` / `cre whoami` (browser-based).

## ENS — what's confirmed

**There is a dedicated hackathon deployment on Sepolia with its own addresses.** Production ENS addresses are wrong here. Addresses are committed in `packages/ens/src/deployment.ts`.

**⚠ The gotcha that would have cost us hours:** viem and ethers ship a built-in Universal Resolver address which **must be overridden** with the hackathon Universal Resolver (`0xd26f...f142`), or resolution silently targets the wrong deployment. Handled by `withHackathonResolver()` in `packages/ens`.

**The registration app has been broken.** Multiple teams hit a hardcoded 21M gas limit on the "Deploy resolver" step and a malformed `initialize` payload. Kevin | ENS confirmed the app is only a convenience layer. **Register directly against the contracts** (commit-reveal, MockUSDC fee) — two teams did so successfully. The Explorer was reported working again later.

**Record naming — Simon Emanuel (ENS):**
> "Yes, agent- prefixes are a good way. Use `-` instead of `.`. … Generally speaking, if your text-records could become a global standard, do `agent-`. If it's just for your application, make a vendor prefix like `com.example.agent-endpoint`"

Perjury's standing is protocol-specific, so keys moved from `perjury.standing` to **`com.perjury.agent-standing`** / `com.perjury.agent-flagged-until`. Also recommended: ENSIP-25, -26, -27 records.

**Simon, on a project close to ours** (subname state gating authorization via EAC + Permissioned Resolver):
> "I like the idea of the super-name defining what a subname can do. Basically having an agent-fleet under `*.agent-fleet.eth` where simply by revoking the subname, the agent loses permission."

And on an agent-heartbeat permission model:
> "The heartbeat is exactly one of the reasons why we created a more complex permission model. That would make a great example/use-case"

This is the ENS team endorsing the shape of our EAC design before we build it.

## Competitive note

At least two other teams are building agent-identity-on-ENSv2 (an AI agent launchpad using subnames for identity/config; an agent-authorization system gating a wallet on subname state). Both stop at *identity and permissions*. Perjury's differentiator is that the record is **reputation the subject cannot write** — written only by a TEE tribunal, and consumed as an eligibility gate by the protocol itself. Lead with that distinction in the submission rather than "agents have ENS names."


---

## ENS answers received (Sep 8)

All five questions answered in the channel. Summary and consequences:

**1. Registration grants *registry* roles only.** Registering a name grants roles on the registry entry (`SET_RESOLVER`, `SET_SUBREGISTRY`, `TRANSFER_ADMIN`, …). **Resolvers are a separate permission world.** You deploy a resolver through the **verifiable factory contract**, and the permissions on it are supplied *at deployment time* as account addresses plus role bitmaps.

*Consequence:* our "revoke the agent's own `ROLE_SET_TEXT`" step does not exist and is not needed — the agent never has resolver write permission unless we grant it. The design gets simpler and strictly stronger: grant `ROLE_SET_TEXT` to `PerjuryStandingWriter` at resolver deployment, grant the agents nothing.

**2. Unauthorized `setText` REVERTS** with `EACUnauthorizedAccountRoles`.

*Consequence:* `scripts/prove-eac.ts` is correctly shaped — it asserts two transactions revert, and we can now assert the specific error.

**3. A contract can hold EAC roles exactly as an EOA can.**

*Consequence:* `PerjuryStandingWriter` works as designed.

**4. One resolver per agent vs. one shared resolver** depends on whether agents need to self-manage records of their own. If they do, each needs its own; if not, share one and grant agents no roles.

*Consequence:* we share a single resolver. Agent identity records (avatar, description) were a nice-to-have, not load-bearing, and dropping them removes a deployment per agent.

**5. ⚠ The footgun we had not considered.** When issuing agent subnames, **do not grant `SET_RESOLVER`** — otherwise an agent can simply point its name at a resolver it controls and write whatever standing it likes, bypassing our EAC scoping entirely.

*Consequence:* this is a real bypass of the project's central security property, and it lives in the *registry* roles rather than the resolver ones — exactly where we weren't looking. Subname issuance must withhold `SET_RESOLVER`.
