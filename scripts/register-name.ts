/**
 * Register a name on the ENSv2 hackathon deployment, direct-to-contract.
 *
 * The hackathon app's resolver-deploy step has been failing for several teams,
 * and ENS confirmed the app is only a convenience layer — so we run the
 * commit-reveal ourselves.
 *
 *   npx tsx scripts/register-name.ts perjury
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { randomBytes } from "node:crypto";
import {
  ENS_HACKATHON_SEPOLIA, ETH_REGISTRAR_ABI, ERC20_ABI, MIN_COMMITMENT_AGE, withHackathonResolver,
} from "@perjury/ens";

const label = process.argv[2] ?? "perjury";
const DURATION = 31_536_000n; // 1 year
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const NO_REFERRER = `0x${"00".repeat(32)}` as Hex;

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} unset`); return v; };
const pk = (need("OPERATOR_PRIVATE_KEY").startsWith("0x") ? need("OPERATOR_PRIVATE_KEY") : `0x${need("OPERATOR_PRIVATE_KEY")}`) as Hex;

const chain = withHackathonResolver(sepolia);
const transport = http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });

const R = ENS_HACKATHON_SEPOLIA.ethRegistrar as Address;
const RESOLVER = ENS_HACKATHON_SEPOLIA.publicResolverV2 as Address;
const USDC = ENS_HACKATHON_SEPOLIA.mockUsdc as Address;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\nRegistering "${label}.eth" as ${account.address}\n`);

  const available = await pub.readContract({ address: R, abi: ETH_REGISTRAR_ABI, functionName: "isAvailable", args: [label] });
  if (!available) throw new Error(`${label}.eth is not available`);
  console.log(`  available: yes`);

  const [base, premium] = await pub.readContract({
    address: R, abi: ETH_REGISTRAR_ABI, functionName: "getRegisterPrice", args: [label, DURATION, USDC],
  });
  const total = base + premium;
  console.log(`  price: ${Number(total) / 1e6} USDC (base ${Number(base) / 1e6} + premium ${Number(premium) / 1e6})`);

  const bal = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  if (bal < total) throw new Error(`insufficient MockUSDC: have ${Number(bal) / 1e6}, need ${Number(total) / 1e6}`);

  // Approve the registrar to take the fee.
  console.log(`\n  approving registrar for ${Number(total) / 1e6} USDC…`);
  const approveHash = await wallet.writeContract({ address: USDC, abi: ERC20_ABI, functionName: "approve", args: [R, total] });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  console.log(`  approve tx: ${approveHash}`);

  // Commit.
  const secret = `0x${randomBytes(32).toString("hex")}` as Hex;
  const commitment = await pub.readContract({
    address: R, abi: ETH_REGISTRAR_ABI, functionName: "makeCommitment",
    args: [label, account.address, secret, ZERO, RESOLVER, DURATION, NO_REFERRER],
  });
  console.log(`\n  commitment: ${commitment}`);
  const commitHash = await wallet.writeContract({ address: R, abi: ETH_REGISTRAR_ABI, functionName: "commit", args: [commitment] });
  await pub.waitForTransactionReceipt({ hash: commitHash });
  console.log(`  commit tx:  ${commitHash}`);

  console.log(`\n  waiting ${MIN_COMMITMENT_AGE + 5}s for the commitment to age…`);
  await sleep((MIN_COMMITMENT_AGE + 5) * 1000);

  // Reveal.
  const registerHash = await wallet.writeContract({
    address: R, abi: ETH_REGISTRAR_ABI, functionName: "register",
    args: [label, account.address, secret, ZERO, RESOLVER, DURATION, USDC, NO_REFERRER],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: registerHash });
  console.log(`\n  register tx: ${registerHash}`);
  console.log(`  status:      ${receipt.status}`);
  console.log(`\n  ✅ ${label}.eth registered. Record this in docs/TX_HASHES.md\n`);
}

main().catch((e) => { console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
