/**
 * Create and register the appeal-panel agents.
 *
 * A panel of three needs three agents that are neither party to the claim, so a
 * two-agent roster cannot seat one. Each stakes like any other agent.
 *
 *   npx tsx scripts/register-panel.ts [count]
 */
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { sepolia } from "viem/chains";
import { appendFileSync } from "node:fs";
import { dnsEncode, withHackathonResolver } from "@perjury/ens";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} unset`); return v; };
const opPk = (need("OPERATOR_PRIVATE_KEY").startsWith("0x") ? need("OPERATOR_PRIVATE_KEY") : `0x${need("OPERATOR_PRIVATE_KEY")}`) as Hex;
const ROSTER = need("WITNESS_ROSTER_ADDRESS") as Address;
const STAKE = parseEther(process.env.REGISTRATION_STAKE_ETH ?? "0.01");
const count = Number(process.argv[2] ?? 3);

const chain = withHackathonResolver(sepolia);
const transport = http(process.env.SEPOLIA_RPC_URL);
const pub = createPublicClient({ chain, transport });
const op = createWalletClient({ account: privateKeyToAccount(opPk), chain, transport });

const ROSTER_ABI = [{
  type: "function", name: "registerAgent", stateMutability: "payable",
  inputs: [{ name: "ensNode", type: "bytes32" }, { name: "dnsName", type: "bytes" }], outputs: [],
}] as const;

for (let i = 1; i <= count; i++) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const name = `panel-${i}.perjury.eth`;

  // Fund for the stake plus gas.
  const fund = await op.sendTransaction({ to: account.address, value: STAKE + parseEther("0.003") });
  await pub.waitForTransactionReceipt({ hash: fund });

  const wallet = createWalletClient({ account, chain, transport });
  const hash = await wallet.writeContract({
    address: ROSTER, abi: ROSTER_ABI, functionName: "registerAgent",
    args: [namehash(name), dnsEncode(name)], value: STAKE,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${name}  ${account.address}  ${r.status}`);
  appendFileSync(".env", `\nPANEL_${i}_PK=${pk}\nPANEL_${i}_ADDR=${account.address}`);
}
console.log("\npanel agents registered and staked");
