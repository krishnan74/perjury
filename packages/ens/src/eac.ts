// ENSv2 Enhanced Access Control helpers. See docs/design.md §4.2.
//
// Role constants and resource derivation taken from the ENSv2 Permissioned
// Resolver docs. The critical property for Perjury: resolver resources derive
// from the SETTER ARGUMENT ALONE — "names play no part in resource computation".
// So a grant of ROLE_SET_TEXT scoped to one text key authorises that key on that
// resolver, and nothing else.
import { keccak256, toBytes } from "viem";
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
 */
export const TRIBUNAL_GRANTS = [
  { role: ROLE.SET_TEXT, key: RECORD_KEYS.standing, resource: textResource(RECORD_KEYS.standing) },
  { role: ROLE.SET_TEXT, key: RECORD_KEYS.flaggedUntil, resource: textResource(RECORD_KEYS.flaggedUntil) },
] as const;

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
