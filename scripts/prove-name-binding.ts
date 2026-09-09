/**
 * Proves that an agent cannot bind reputation to a name it was not issued.
 *
 *   npx tsx scripts/prove-name-binding.ts
 *
 * Three attempts against the live roster, two of which must revert:
 *
 *   1. a stranger registering an EXISTING agent's name   -> NameNotControlled
 *   2. a stranger registering an unissued name           -> NameNotResolvable
 *   3. the real holder registering its own name          -> succeeds
 *
 * Why this matters. Standing is written to an agent's ENS record, and that
 * record decides whether the agent may witness for anyone else. Without this
 * check, `nodeTaken` would stop a SECOND claim on a name but never the first —
 * so an attacker could bind its own misbehaviour to somebody else's name, or
 * squat names to deny their holders registration.
 *
 * The binding lives in a text record written by the namespace operator, and is
 * deliberately a DIFFERENT EAC key from the standing record: the tribunal that
 * lowers an agent's standing must not also be able to decide whose standing it
 * is, or a slashed identity could be moved onto a clean name.
 */
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import { dnsEncode, withHackathonResolver } from "@perjury/ens";

const chain = withHackathonResolver(sepolia);
const transport = http(process.env.SEPOLIA_RPC_URL);
const pub = createPublicClient({ chain, transport });

const opPk = (process.env.OPERATOR_PRIVATE_KEY!.startsWith("0x")
  ? process.env.OPERATOR_PRIVATE_KEY!
  : `0x${process.env.OPERATOR_PRIVATE_KEY}`) as Hex;
const operator = privateKeyToAccount(opPk);
const op = createWalletClient({ account: operator, chain, transport });

const ROSTER = process.env.WITNESS_ROSTER_ADDRESS as Address;
const STAKE = BigInt(process.env.REGISTRATION_STAKE_WEI ?? parseEther("0.01").toString());

const ROSTER_ABI = [
  {
    type: "function", name: "registerAgent", stateMutability: "payable",
    inputs: [{ name: "ensNode", type: "bytes32" }, { name: "dnsName", type: "bytes" }], outputs: [],
  },
  { type: "function", name: "withdrawStake", stateMutability: "nonpayable", inputs: [], outputs: [] },
  // Declared so viem decodes the revert by NAME rather than reporting a bare
  // "reverted" — the distinction between the two refusals is the whole point.
  { type: "error", name: "NameNotResolvable", inputs: [] },
  {
    type: "error", name: "NameNotControlled",
    inputs: [{ name: "resolved", type: "address" }, { name: "caller", type: "address" }],
  },
  { type: "error", name: "NodeTaken", inputs: [] },
  { type: "error", name: "AlreadyRegistered", inputs: [] },
  { type: "error", name: "StakeTooSmall", inputs: [] },
] as const;

const c = {
  reset: "\x1b[0m", grey: "\x1b[90m", green: "\x1b[32m", red: "\x1b[31m",
  bold: "\x1b[1m", cyan: "\x1b[36m",
};

/** Attempt a registration and report what the chain said. */
async function attempt(label: string, pk: Hex, fqdn: string, expectRevert: boolean) {
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport });
  process.stdout.write(`  ${c.cyan}${label}${c.reset}\n    ${c.grey}${account.address} -> ${fqdn}${c.reset}\n`);
  try {
    const hash = await wallet.writeContract({
      address: ROSTER, abi: ROSTER_ABI, functionName: "registerAgent",
      args: [namehash(fqdn), dnsEncode(fqdn)], value: STAKE,
    });
    await pub.waitForTransactionReceipt({ hash });
    if (expectRevert) {
      console.log(`    ${c.red}${c.bold}FAILED — registration succeeded and should not have${c.reset}\n`);
      process.exitCode = 1;
    } else {
      console.log(`    ${c.green}✓ registered${c.reset} ${c.grey}sepolia.etherscan.io/tx/${hash}${c.reset}\n`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    const named = /NameNotControlled|NameNotResolvable|AlreadyRegistered|NodeTaken/.exec(msg)?.[0];
    if (expectRevert) {
      console.log(`    ${c.green}✓ refused${c.reset} ${c.bold}${named ?? "reverted"}${c.reset}\n`);
    } else {
      console.log(`    ${c.red}✗ unexpected revert: ${named ?? msg.slice(0, 120)}${c.reset}\n`);
      process.exitCode = 1;
    }
  }
}

console.log(`\n${c.bold}Registration requires the name to have been issued to you${c.reset}`);
console.log(`${c.grey}roster ${ROSTER}${c.reset}\n`);

const resolverAbi = [{
  type: "function", name: "setText", stateMutability: "nonpayable",
  inputs: [{ name: "name", type: "bytes" }, { name: "key", type: "string" }, { name: "value", type: "string" }],
  outputs: [],
}] as const;

// A funded stranger: holds ETH and a stake, holds no name.
const strangerPk = generatePrivateKey();
const stranger = privateKeyToAccount(strangerPk);
const fund = STAKE + parseEther("0.004");
const fundHash = await op.sendTransaction({ to: stranger.address, value: fund * 2n });
await pub.waitForTransactionReceipt({ hash: fundHash });
console.log(`  ${c.grey}funded stranger ${stranger.address}${c.reset}\n`);

// 1. A name issued to somebody else, and not yet registered.
//
//    It has to be UNregistered to demonstrate this check: `nodeTaken` is tested
//    first, so an already-registered name reverts NodeTaken and proves only the
//    older rule. The interesting case is the name nobody has claimed yet, where
//    the binding record is the only thing standing in the way.
const victim = privateKeyToAccount(generatePrivateKey());
const victimName = `victim-${Date.now().toString(36)}.perjury.eth`;
const issueVictim = await op.writeContract({
  address: process.env.PERJURY_RESOLVER_ADDRESS as Address, abi: resolverAbi,
  functionName: "setText",
  args: [dnsEncode(victimName), "com.perjury.agent-address", victim.address.toLowerCase()],
});
await pub.waitForTransactionReceipt({ hash: issueVictim });
console.log(`  ${c.grey}operator issues ${victimName} -> ${victim.address} (unregistered)${c.reset}\n`);
await attempt("stranger claims a name issued to someone else", strangerPk, victimName, true);

// 2. A name nobody was issued. Absence of a binding is a refusal, not a pass —
//    consistent with every other ENS read in this protocol.
await attempt("stranger claims a name nobody was issued", strangerPk, "not-issued.perjury.eth", true);

// 3. The control: issue the stranger its own name, then let it register.
const fqdn = `prover-${Date.now().toString(36)}.perjury.eth`;
const issue = await op.writeContract({
  address: process.env.PERJURY_RESOLVER_ADDRESS as Address, abi: resolverAbi,
  functionName: "setText", args: [dnsEncode(fqdn), "com.perjury.agent-address", stranger.address.toLowerCase()],
});
await pub.waitForTransactionReceipt({ hash: issue });
console.log(`  ${c.grey}operator issues ${fqdn} -> ${stranger.address}${c.reset}\n`);
await attempt("holder registers the name it was issued", strangerPk, fqdn, false);

// Leave the roster as we found it — the control registration was a probe, not
// an agent, and an extra eligible witness would skew the collusion scene.
try {
  const w = createWalletClient({ account: stranger, chain, transport });
  const hash = await w.writeContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "withdrawStake" });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${c.grey}probe withdrawn — roster left as found${c.reset}\n`);
} catch (err) {
  console.log(`  ${c.red}could not withdraw probe stake: ${(err as Error).message.slice(0, 100)}${c.reset}\n`);
}

console.log(`${c.grey}Two refusals and one success. The refusals are the point: reputation${c.reset}`);
console.log(`${c.grey}cannot be attached to a name you were not given, so it cannot be${c.reset}`);
console.log(`${c.grey}poisoned by somebody else's behaviour or squatted out from under you.${c.reset}\n`);
