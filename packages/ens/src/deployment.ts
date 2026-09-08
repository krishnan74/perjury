// ENSv2 hackathon deployment on Sepolia. See docs/design.md §4.
//
// ⚠ These are the ETHOnline hackathon deployment addresses, NOT the production
// ENS addresses. Building against production addresses resolves the wrong
// deployment and silently produces meaningless results.
// Source: ENS team, ETHOnline Discord (docs/prompts/03-sponsor-channel-notes.md).

export const ENS_HACKATHON_SEPOLIA = {
  chainId: 11155111,
  /** viem/ethers ship a DIFFERENT built-in address — this must override it. */
  universalResolver: "0xd26f2040d083af1cd2962ba303f4bea0c4faf142",
  ethRegistry: "0xe7f0d5724f8337e3aa9a9910540341ff4273fed9",
  ethRegistrar: "0x7d1b7f586a62ac3f54b9a396849757814283270b",
  publicResolverV2: "0xf9de4979ddb290baf5b760d0e788125017bc33f6",
  /** Registration fee token. Fund the registering account with this. */
  mockUsdc: "0xcbfd80f74375c54e545af34788ff465f96f66f05",
  /**
   * Resolvers are deployed through this factory, and their EAC roles are supplied
   * AT DEPLOYMENT TIME as (account, roleBitmap) pairs. Registration itself grants
   * only registry roles — resolvers are a separate permission world.
   */
  verifiableFactory: "0x894bc9cc8ff1ad96b8a288c86a8c71d662c07780",
  permissionedResolverImpl: "0xa9d3814ab151bf6e37a427432795371a8361614e",
} as const;

export const ENS_HACKATHON_URLS = {
  docs: "https://feature-permres-inode-refact.docs-bao.pages.dev/ensv2/overview",
  deployments:
    "https://feature-permres-inode-refact.docs-bao.pages.dev/learn/deployments#sepolia-ensv2-beta",
  explorer: "https://hackathon-deployment-portal-app.ens-cf.workers.dev/",
  registerApp: "https://hackathon-deployment-manager-app-v4.ens-cf.workers.dev/",
} as const;

/**
 * Reputation record keys.
 *
 * Vendor-prefixed per ENS team guidance (Simon Emanuel, ETHOnline Discord):
 * use `agent-` with hyphens for keys intended as a global standard, otherwise a
 * vendor prefix like `com.example.agent-endpoint`. Perjury's standing is
 * protocol-specific, so it takes the vendor prefix.
 *
 * These are the ONLY keys the tribunal may write (docs/design.md §4.2).
 */
export const RECORD_KEYS = {
  standing: "com.perjury.agent-standing",
  flaggedUntil: "com.perjury.agent-flagged-until",
} as const;

/**
 * viem override. Without this, resolution silently targets the wrong deployment.
 *
 *   import { sepolia } from "viem/chains";
 *   const chain = withHackathonResolver(sepolia);
 */
export function withHackathonResolver<T extends { contracts?: Record<string, unknown> }>(chain: T): T {
  return {
    ...chain,
    contracts: {
      ...chain.contracts,
      ensUniversalResolver: {
        address: ENS_HACKATHON_SEPOLIA.universalResolver,
        blockCreated: 0,
      },
    },
  };
}
