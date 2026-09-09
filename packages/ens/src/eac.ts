// ENSv2 Enhanced Access Control helpers. See docs/design.md §4.2.
//
// Role constants and resource derivation taken from the ENSv2 Permissioned
// Resolver docs. The critical property for Perjury: resolver resources derive
// from the SETTER ARGUMENT ALONE — "names play no part in resource computation".
// So a grant of ROLE_SET_TEXT scoped to one text key authorises that key on that
// resolver, and nothing else.
import { encodeFunctionData, keccak256, toBytes } from "viem";
import { RECORD_KEYS } from "./deployment.js";

/** Permissioned Resolver roles. Each has an admin counterpart at role << 128n. */
export const ROLE = {
  SET_ADDRESS: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_CONTENTHASH: 1n << 8n,
  SET_ABI: 1n << 12n,
  SET_INTERFACE: 1n << 16n,
  SET_NAME: 1n << 20n,
  SET_DATA: 1n << 24n,
  LINK: 1n << 28n,
  CAN_NAME: 1n << 120n,
  UPGRADE: 1n << 124n,
} as const;

export const adminOf = (role: bigint): bigint => role << 128n;

/** Resource for a text-key-scoped role: keccak256 of the key bytes. */
export const textResource = (key: string): `0x${string}` => keccak256(toBytes(key));

/**
 * Exactly what the tribunal is granted — and, by omission, everything it is not.
 *
 * It receives SET_TEXT scoped to two keys. It receives no SET_ADDRESS, no
 * SET_NAME, no LINK, no UPGRADE, and no admin role of any kind, so it cannot
 * reassign ownership, alter identity records, or grant roles to anyone else.
 *
 * These are supplied to the VerifiableFactory at resolver-deployment time, not
 * granted afterwards. Agents are granted NOTHING on this resolver — confirmed by
 * the ENS team: registration grants only registry roles, so an agent has no
 * resolver write permission unless explicitly given one. There is nothing to
 * revoke.
 */
export const TRIBUNAL_GRANTS = [
  { role: ROLE.SET_TEXT, key: RECORD_KEYS.standing, resource: textResource(RECORD_KEYS.standing) },
  { role: ROLE.SET_TEXT, key: RECORD_KEYS.flaggedUntil, resource: textResource(RECORD_KEYS.flaggedUntil) },
] as const;

/**
 * Keys the tribunal must never hold, asserted rather than assumed.
 *
 * The issuance binding says which address a name belongs to. If the tribunal
 * could write it, the contract that lowers an agent's standing could also
 * reassign whose standing it is — which would let a slashed identity be moved
 * onto a clean name, or a clean identity onto a slashed one. Separating the two
 * writers is what makes the reputation non-repudiable.
 */
export const TRIBUNAL_FORBIDDEN_KEYS = [
  { key: RECORD_KEYS.binding, resource: textResource(RECORD_KEYS.binding) },
] as const;

/** Granted to the namespace operator, which issues subnames. Never to an agent. */
export const ISSUANCE_GRANTS = [
  { role: ROLE.SET_TEXT, key: RECORD_KEYS.binding, resource: textResource(RECORD_KEYS.binding) },
] as const;

/**
 * Registry roles. Distinct from resolver roles — a separate permission world.
 * `register(label, owner, registry, resolver, roleBitmap, expiry)` grants the
 * owner exactly the roles in `roleBitmap`, so withholding is simply omission.
 */
export const REGISTRY_ROLE = {
  REGISTRAR: 1n << 0n,
  REGISTER_RESERVED: 1n << 4n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
  SET_URI: 1n << 36n,
  UPGRADE: 1n << 124n,
} as const;

/**
 * The roleBitmap we grant an agent when issuing its subname.
 *
 * Deliberately minimal — and specifically WITHOUT SET_RESOLVER, which would let
 * the agent repoint its name at a resolver it controls and write any standing it
 * likes, bypassing every resolver-level restriction. RENEW only: the agent may
 * keep its own name alive and do nothing else.
 */
export const AGENT_SUBNAME_ROLES = REGISTRY_ROLE.RENEW;

/**
 * Registry roles that must NEVER be granted to an agent on its own subname.
 *
 * SET_RESOLVER is the important one and it is not obvious: an agent holding it can
 * repoint its name at a resolver it controls and write any standing it likes,
 * bypassing every resolver-level restriction below. The bypass lives in the
 * registry permission world, not the resolver one. Flagged by the ENS team.
 */
export const FORBIDDEN_AGENT_REGISTRY_ROLES = [
  { name: "SET_RESOLVER", role: REGISTRY_ROLE.SET_RESOLVER }, // repoint at an attacker-controlled resolver
  { name: "SET_SUBREGISTRY", role: REGISTRY_ROLE.SET_SUBREGISTRY }, // reissue beneath a registry they control
  { name: "CAN_TRANSFER_ADMIN", role: REGISTRY_ROLE.CAN_TRANSFER_ADMIN }, // hand the name to another account
  { name: "UPGRADE", role: REGISTRY_ROLE.UPGRADE },
] as const;

/**
 * Encode the "setter" argument for `grantSetterRoles`.
 *
 * The resolver derives the resource from the *argument* in this calldata — only
 * the selector and the key matter, the name and value are ignored. This is what
 * narrows a grant from "any text record on this resolver" to one specific key.
 * Confirmed by the ENS team: initialisation grants land on the root resource
 * only, so per-key scoping has to be applied after deployment.
 */
export function setTextSetter(key: string): `0x${string}` {
  return encodeFunctionData({
    abi: PERMISSIONED_RESOLVER_ABI,
    functionName: "setText",
    // name and value are placeholders; the resolver reads only the key.
    args: ["0x00", key, ""],
  });
}

/**
 * Root-resource grants use the *RootRoles variants. `grantRoles(resource, ...)`
 * reverts for the root resource — verified on-chain against a factory-deployed
 * Permissioned Resolver.
 */
export const ROOT_RESOURCE = `0x${"00".repeat(32)}` as const;

/** Error selector when a caller lacks the role. Confirmed: setText REVERTS. */
export const EAC_UNAUTHORIZED_ERROR = "EACUnauthorizedAccountRoles";

/** Roles the tribunal must NEVER hold. Asserted by scripts/prove-eac.ts. */
export const FORBIDDEN_TRIBUNAL_ROLES = [
  { name: "SET_ADDRESS", role: ROLE.SET_ADDRESS },
  { name: "SET_NAME", role: ROLE.SET_NAME },
  { name: "LINK", role: ROLE.LINK },
  { name: "UPGRADE", role: ROLE.UPGRADE },
  { name: "CAN_NAME", role: ROLE.CAN_NAME },
  { name: "SET_TEXT_ADMIN", role: adminOf(ROLE.SET_TEXT) },
] as const;

/** DNS wire format, required by setText(bytes name, ...). */
export function dnsEncode(name: string): `0x${string}` {
  const parts = name.split(".").filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const bytes = new TextEncoder().encode(p);
    if (bytes.length > 63) throw new Error(`label too long: ${p}`);
    out.push(bytes.length, ...bytes);
  }
  out.push(0);
  return `0x${out.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const PERMISSIONED_RESOLVER_ABI = [
  {
    type: "function",
    name: "setText",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "text",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantSetterRoles",
    inputs: [
      { name: "setter", type: "bytes" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "multicall",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ type: "bytes[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "grantRootRoles",
    inputs: [
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeRootRoles",
    inputs: [
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "hasRootRoles",
    inputs: [
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantRoles",
    inputs: [
      { name: "resource", type: "bytes32" },
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeRoles",
    inputs: [
      { name: "resource", type: "bytes32" },
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "hasRoles",
    inputs: [
      { name: "resource", type: "bytes32" },
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;
