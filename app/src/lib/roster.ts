/**
 * The roster, as the protocol itself sees it.
 *
 * Standing is read from ENS through the same reader contract the VRF callback
 * uses, not from a cache — so what this page shows is exactly what decides
 * eligibility at assignment time. If an ENS record becomes unreadable, this page
 * reports the agent ineligible for the same reason the protocol would.
 */
import { ROSTER, ROSTER_ABI, READER_ABI, pub } from "./perjury";
import type { Address } from "viem";

const READER = process.env.STANDING_READER_ADDRESS as Address;

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
  /** False when the ENS record could not be read at all — which fails closed. */
  standingReadable: boolean;
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

export async function rosterSnapshot(): Promise<Agent[]> {
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
      const [ensNode, dnsName, , registeredAt, stake] = record as unknown as [
        `0x${string}`, `0x${string}`, boolean, bigint, bigint,
      ];

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

      return {
        address,
        name: decodeDnsName(dnsName) || address,
        ensNode,
        standing,
        standingReadable,
        stake,
        eligible,
        flaggedUntil: Number(flagged),
        registeredAt: Number(registeredAt),
      };
    }),
  );
}
