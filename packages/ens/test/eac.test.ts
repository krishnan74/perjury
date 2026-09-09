// EAC scoping. These tests assert the narrowness of the tribunal's grant —
// what it may write, and everything it must never be able to touch.
import { describe, expect, it } from "vitest";
import {
  ROLE, adminOf, textResource, dnsEncode,
  TRIBUNAL_GRANTS, FORBIDDEN_TRIBUNAL_ROLES, RECORD_KEYS,
  FORBIDDEN_AGENT_REGISTRY_ROLES, EAC_UNAUTHORIZED_ERROR,
  REGISTRY_ROLE, AGENT_SUBNAME_ROLES,
  TRIBUNAL_FORBIDDEN_KEYS, ISSUANCE_GRANTS,
} from "@perjury/ens";

describe("EAC role math", () => {
  it("matches the documented Permissioned Resolver constants", () => {
    expect(ROLE.SET_TEXT).toBe(1n << 4n);
    expect(ROLE.SET_ADDRESS).toBe(1n << 0n);
    expect(ROLE.UPGRADE).toBe(1n << 124n);
    expect(adminOf(ROLE.SET_TEXT)).toBe((1n << 4n) << 128n);
  });

  it("derives a text resource from the key alone", () => {
    expect(textResource(RECORD_KEYS.standing)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(textResource("a")).not.toBe(textResource("b"));
    // Same key ⇒ same resource, regardless of which name it is written under.
    expect(textResource(RECORD_KEYS.standing)).toBe(textResource(RECORD_KEYS.standing));
  });

  it("grants only SET_TEXT, and only for the two reputation keys", () => {
    expect(TRIBUNAL_GRANTS).toHaveLength(2);
    for (const g of TRIBUNAL_GRANTS) expect(g.role).toBe(ROLE.SET_TEXT);
    expect(TRIBUNAL_GRANTS.map((g) => g.key).sort()).toEqual(
      [RECORD_KEYS.standing, RECORD_KEYS.flaggedUntil].sort(),
    );
  });

  // If this fails, the tribunal can do more than write a number.
  it("never grants a role the tribunal must not hold", () => {
    const granted = new Set<bigint>(TRIBUNAL_GRANTS.map((g) => g.role));
    for (const f of FORBIDDEN_TRIBUNAL_ROLES) {
      expect(granted.has(f.role)).toBe(false);
    }
  });

  it("grants no admin role, so the tribunal cannot re-grant to anyone", () => {
    for (const g of TRIBUNAL_GRANTS) expect(g.role < 1n << 128n).toBe(true);
  });
});

describe("registry-level bypass", () => {
  // The subtle one: resolver scoping is irrelevant if an agent can repoint its
  // name at a resolver it controls. That power lives in the registry roles.
  it("withholds SET_RESOLVER from agents", () => {
    expect(FORBIDDEN_AGENT_REGISTRY_ROLES.map((r) => r.name)).toContain("SET_RESOLVER");
  });

  // The bitmap we actually pass to register() must not contain any of them.
  it("the agent subname roleBitmap grants none of the forbidden roles", () => {
    for (const f of FORBIDDEN_AGENT_REGISTRY_ROLES) {
      expect(AGENT_SUBNAME_ROLES & f.role).toBe(0n);
    }
  });

  it("grants agents only RENEW", () => {
    expect(AGENT_SUBNAME_ROLES).toBe(REGISTRY_ROLE.RENEW);
  });

  it("records that unauthorized setText reverts", () => {
    expect(EAC_UNAUTHORIZED_ERROR).toBe("EACUnauthorizedAccountRoles");
  });
});

describe("dnsEncode", () => {
  it("length-prefixes each label and null-terminates", () => {
    // 0x03 'e' 't' 'h' 0x00
    expect(dnsEncode("eth")).toBe("0x0365746800");
  });

  it("encodes a multi-label name", () => {
    // 0x05 'a''l''i''c''e' 0x07 'p''e''r''j''u''r''y' 0x03 'e''t''h' 0x00
    expect(dnsEncode("alice.perjury.eth")).toBe("0x05616c696365077065726a7572790365746800");
  });

  it("rejects an over-long label", () => {
    expect(() => dnsEncode(`${"x".repeat(64)}.eth`)).toThrow(/label too long/);
  });
});

// ── Issuance binding is a separate permission from standing ─────────────────
describe("issuance binding", () => {
  it("is not among the tribunal's grants", () => {
    // The contract that can lower standing must not be able to decide whose
    // standing it is.
    const granted = TRIBUNAL_GRANTS.map((g) => g.key);
    expect(granted).not.toContain(RECORD_KEYS.binding);
  });

  it("is explicitly listed as forbidden to the tribunal", () => {
    expect(TRIBUNAL_FORBIDDEN_KEYS.map((k) => k.key)).toContain(RECORD_KEYS.binding);
  });

  it("resolves to a different EAC resource than standing", () => {
    // Per-key scoping only works if the resources actually differ.
    expect(textResource(RECORD_KEYS.binding)).not.toEqual(textResource(RECORD_KEYS.standing));
  });

  it("is granted to issuance, and issuance holds nothing else", () => {
    expect(ISSUANCE_GRANTS).toHaveLength(1);
    expect(ISSUANCE_GRANTS[0]!.key).toBe(RECORD_KEYS.binding);
    expect(ISSUANCE_GRANTS[0]!.role).toBe(ROLE.SET_TEXT);
  });
});
