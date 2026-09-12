/**
 * The roster, as the protocol itself sees it.
 *
 * Standing is read from ENS through the same reader contract the VRF callback
 * uses, not from a cache — so what this page shows is exactly what decides
 * eligibility at assignment time. If an ENS record becomes unreadable, this page
 * reports the agent ineligible for the same reason the protocol would.
 */
import { ROSTER_ABI, READER_ABI, pub } from "./perjury";
import { currentDeployment, type Deployment } from "./deployments";
import { withHackathonResolver } from "@perjury/ens";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";

/**
 * A second client that goes through the ENS Universal Resolver.
 *
 * The protocol's own reader has the resolver address compiled into it, which
 * means it can read a name that nobody else can reach — and for a while it did.
 * `perjury.eth` had no subname registry and pointed at the default resolver, so
 * the agent names did not exist in ENS at all, every explorer said so, and our
 * reader kept returning standing regardless. Resolving the same record the way
 * any third party would is the check that would have caught it, so the page now
 * does both and shows when they disagree.
 */
const ens = createPublicClient({
  chain: withHackathonResolver(sepolia),
  transport: http(process.env.SEPOLIA_RPC_URL),
});

/** Text key holding an agent's standing. Kept here to avoid a wider import. */
const STANDING_KEY = "com.perjury.agent-standing";

export interface Agent {
  address: Address;
  /** Decoded from the DNS-encoded name the agent registered with. */
  name: string;
  /**
   * The ENS node the agent registered under. `StandingUpdated` is indexed by
   * node and carries no address, so this is the only join back to an agent.
   */
  ensNode: `0x${string}`;
  standing: number;
  /**
   * False once an agent has called `withdrawStake`, which deregisters it.
   *
   * `agentList` is append-only, so a departed agent keeps its row forever. Left
   * unread, that row is indistinguishable from a slashed one and the page said
   * "stake slashed to zero" about agents nothing had slashed.
   */
  active: boolean;
  /** False when the ENS record could not be read at all — which fails closed. */
  standingReadable: boolean;
  /**
   * The resolver the ENS registry hands back for this name when asked by the
   * Universal Resolver, with nothing supplied but the name. Null means the name
   * does not exist as far as any third party is concerned — the failure this
   * project shipped unnoticed, because our own reader has the address compiled
   * in and never has to ask.
   */
  publicResolver: Address | null;
  /**
   * Standing as that public path reports it. Null is not a failure on its own:
   * an agent that has never been judged has no standing record to read, which
   * is a different thing from a name nobody can reach.
   */
  publicStanding: number | null;
  stake: bigint;
  eligible: boolean;
  flaggedUntil: number;
  registeredAt: number;
}

/** DNS wire format → dotted name. Length-prefixed labels, terminated by 0x00. */
export function decodeDnsName(hex: string): string {
  const bytes = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i]!;
    if (len === 0) break;
    labels.push(bytes.subarray(i + 1, i + 1 + len).toString("utf8"));
    i += len + 1;
  }
  return labels.join(".");
}

export async function rosterSnapshot(deployment: Deployment = currentDeployment()): Promise<Agent[]> {
  // A roster belongs to its cascade. Reading the live roster while replaying an
  // archived claim would show today's agents standing in for the ones the draw
  // actually chose from, which is a quiet lie about how the draw went.
  const { roster: ROSTER, reader: READER } = deployment;
  const count = await pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agentCount" });

  const addresses = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agentList", args: [BigInt(i)] }),
    ),
  );

  return Promise.all(
    addresses.map(async (address): Promise<Agent> => {
      const [record, eligible, flagged] = await Promise.all([
        pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "agents", args: [address] }),
        pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "isEligible", args: [address] }),
        pub.readContract({ address: ROSTER, abi: ROSTER_ABI, functionName: "flaggedUntil", args: [address] }),
      ]);
      const [ensNode, dnsName, active, registeredAt, stake] = record as unknown as [
        `0x${string}`, `0x${string}`, boolean, bigint, bigint,
      ];

      const name = decodeDnsName(dnsName);

      // Read standing exactly as the protocol does — through ENS, not a mirror.
      let standing = 0;
      let standingReadable = false;
      try {
        const [value, readable] = (await pub.readContract({
          address: READER, abi: READER_ABI, functionName: "standingOfNameChecked", args: [ensNode, dnsName],
        })) as unknown as [bigint, boolean];
        standing = Number(value);
        standingReadable = readable;
      } catch {
        standingReadable = false;
      }

      // And again, the way anyone else would: ENSIP-10 through the Universal
      // Resolver, which has to walk the registry to find the resolver instead of
      // being told where it is.
      const [publicResolver, publicStanding] = name
        ? await Promise.all([
            ens.getEnsResolver({ name }).catch(() => null),
            ens
              .getEnsText({ name, key: STANDING_KEY })
              .then((t) => (t && Number.isFinite(Number(t)) ? Number(t) : null))
              .catch(() => null),
          ])
        : [null, null];

      return {
        address,
        name: name || address,
        ensNode,
        active,
        standing,
        standingReadable,
        publicResolver: publicResolver && publicResolver !== "0x0000000000000000000000000000000000000000"
          ? publicResolver
          : null,
        publicStanding,
        stake,
        eligible,
        flaggedUntil: Number(flagged),
        registeredAt: Number(registeredAt),
      };
    }),
  );
}
