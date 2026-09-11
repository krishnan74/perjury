/**
 * Which set of contracts a page is reading.
 *
 * Every contract in this protocol holds the next one immutably, and the
 * registry's pointer at its verdict sink locks on first wiring. So switching the
 * sink to the Forwarder a DON-executed workflow reports through meant deploying
 * the whole cascade again, and a new registry starts counting claims at one.
 *
 * The old contracts did not go anywhere. They still hold every claim that has
 * ever settled here, including the appeal that the demo is built around, and
 * those transactions are as real as they were last week. Dropping them to make
 * the code simpler would have meant deleting the project's own evidence, so the
 * site reads both and says which is which.
 *
 * Claim ids are per-deployment and both start at one, so an id alone is
 * ambiguous. Anything addressing a claim carries the deployment with it.
 */
import type { Address } from "viem";

export interface Deployment {
  /** Short key used in URLs. */
  id: string;
  /** What to call it on screen. */
  label: string;
  /** One line explaining why it exists, shown where a reader could be confused. */
  note: string;
  registry: Address;
  roster: Address;
  writer: Address;
  reader: Address;
  sink: Address;
  /**
   * The block its first claim landed in.
   *
   * Pages read a rolling window of recent blocks otherwise, which is fine while
   * a deployment is hours old and wrong the moment it is not: the archived
   * cascade would show its newest claims and the rest would look like they had
   * never happened. A deployment has a beginning, so read from it.
   */
  fromBlock: bigint;
  /** True for the contracts a new claim would be submitted to. */
  current: boolean;
}

const env = (k: string) => process.env[k] as Address | undefined;

/**
 * The contracts a claim submitted right now would go to.
 *
 * Read from the environment rather than hard-coded, because a cascade rewrites
 * .env and a second copy in source is how the two drift.
 */
const CURRENT: Deployment = {
  id: "live",
  label: "Live",
  note: "The contracts a new claim is submitted to. Its verdict sink accepts reports from the Forwarder a workflow deployed to the DON reports through.",
  registry: env("CLAIM_REGISTRY_ADDRESS")!,
  roster: env("WITNESS_ROSTER_ADDRESS")!,
  writer: env("STANDING_WRITER_ADDRESS")!,
  reader: env("STANDING_READER_ADDRESS")!,
  sink: env("VERDICT_SINK_ADDRESS")!,
  fromBlock: BigInt(process.env.CLAIM_REGISTRY_FROM_BLOCK ?? 11679414),
  current: true,
};

/**
 * The cascade that ran before deploy access arrived.
 *
 * Its sink was built against the simulator's Forwarder, which is immutable, so
 * it can never accept a report from a workflow running on the DON. It is frozen
 * rather than broken: nothing new can settle here, and everything that already
 * did is still readable.
 */
const ARCHIVED: Deployment = {
  id: "sim",
  label: "Archived",
  note: "The cascade used before CRE deploy access arrived. Its verdict sink only accepts the simulator's Forwarder, so nothing new can settle here — but every claim it holds really happened.",
  registry: "0x8CDa96E615E96f97073C19Cc2167E4D242487A88",
  roster: "0x1b686Decd5fc0F5Bd2511E6B63809c340dec2252",
  writer: "0x211C7ff47436D43f90f0d8D90e02bf76a6F70BAD",
  reader: "0x366D0415347b3F996DbDC8549EdFf6f3Ee616C55",
  sink: "0xedABb806dDFe7ACa46707713E2D649f2dd0d86D3",
  fromBlock: 11667347n,
  current: false,
};

export const DEPLOYMENTS: Deployment[] = [CURRENT, ARCHIVED];

export const currentDeployment = (): Deployment => CURRENT;

/** Resolve a URL segment. Falls back to the live contracts, never to nothing. */
export function deploymentById(id?: string | null): Deployment {
  if (!id) return CURRENT;
  return DEPLOYMENTS.find((d) => d.id === id) ?? CURRENT;
}
