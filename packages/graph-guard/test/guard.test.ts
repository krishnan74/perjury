// The reject-never-degrade rule, asserted. See docs/design.md §5.3.
import { describe, expect, it } from "vitest";
import { attest, guard, isUnverifiable, FRESHNESS_BLOCKS } from "@perjury/graph-guard";
import type { PinnedDeployment, RawGraphResponse } from "@perjury/graph-guard";
import type { TypedAssertion } from "@perjury/shared";

const PINNED: PinnedDeployment = {
  subject: "aave-v3-eth-utilization",
  deploymentId: "QmPinnedPrimary",
  backupDeploymentId: "QmPinnedBackup",
};

function response(over: Partial<RawGraphResponse> & { meta?: Partial<RawGraphResponse["_meta"]> } = {}): RawGraphResponse {
  return {
    _meta: {
      deployment: "QmPinnedPrimary",
      block: { number: 1000 },
      hasIndexingErrors: false,
      ...(over.meta ?? {}),
    },
    chainHead: 1010,
    queryDocument: "{ markets { totalBorrowBalanceUSD } }",
    variables: { first: 1 },
    data: { markets: [{ totalBorrowBalanceUSD: "123.45" }] },
    ...over,
  };
}

const assertion = (asOfBlock = 1000): TypedAssertion => ({
  subject: "aave-v3-eth-utilization",
  metric: "totalBorrowBalanceUSD",
  comparator: "gt",
  value: 100,
  unit: "USD",
  asOfBlock,
});

describe("guard", () => {
  it("accepts a live, pinned, fresh response", () => {
    const p = guard(response(), PINNED);
    expect(p.deploymentId).toBe("QmPinnedPrimary");
    expect(p.indexedBlock).toBe(1000);
    expect(p.queryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts the pinned backup deployment", () => {
    const p = guard(response({ meta: { deployment: "QmPinnedBackup" } }), PINNED);
    expect(p.deploymentId).toBe("QmPinnedBackup");
  });

  // The substitution attack: same name, different deployment.
  it("rejects an unpinned deployment id", () => {
    expect(() => guard(response({ meta: { deployment: "QmSomethingElse" } }), PINNED)).toThrowError(
      /not pinned/,
    );
    try {
      guard(response({ meta: { deployment: "QmSomethingElse" } }), PINNED);
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("deployment-mismatch");
    }
  });

  it("rejects a stale index rather than degrading", () => {
    const stale = response({ chainHead: 1000 + FRESHNESS_BLOCKS + 1 });
    try {
      guard(stale, PINNED);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e)).toBe(true);
      if (isUnverifiable(e)) expect(e.reason).toBe("stale-index");
    }
  });

  it("accepts data exactly at the freshness boundary", () => {
    expect(() => guard(response({ chainHead: 1000 + FRESHNESS_BLOCKS }), PINNED)).not.toThrow();
  });

  it("rejects indexing errors", () => {
    try {
      guard(response({ meta: { hasIndexingErrors: true } }), PINNED);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("indexing-errors");
    }
  });

  it("rejects a response with no _meta", () => {
    const r = response();
    delete (r as { _meta?: unknown })._meta;
    try {
      guard(r, PINNED);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("missing-meta");
    }
  });

  // A filter that matched nothing returns a valid-looking response. Deriving a
  // finding from an empty array is exactly the silent degradation we forbid.
  it("rejects a result set where every collection is empty", () => {
    try {
      guard(response({ data: { lendingProtocols: [] } }), PINNED);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("no-data");
    }
  });

  it("rejects a response carrying only _meta", () => {
    try {
      guard(response({ data: {} }), PINNED);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("no-data");
    }
  });

  it("accepts a partially empty result if something matched", () => {
    expect(() =>
      guard(response({ data: { lendingProtocols: [{ id: "1" }], markets: [] } }), PINNED),
    ).not.toThrow();
  });

  it("rejects an empty data payload", () => {
    try {
      guard(response({ data: null }), PINNED);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("no-data");
    }
  });

  // Every failure mode must be Unverifiable — never something a caller could
  // mistake for a pass.
  it("never returns a value on any failure path", () => {
    const failures: RawGraphResponse[] = [
      response({ meta: { deployment: "QmWrong" } }),
      response({ chainHead: 99_999 }),
      response({ meta: { hasIndexingErrors: true } }),
      response({ data: null }),
    ];
    for (const f of failures) {
      expect(() => guard(f, PINNED)).toThrowError();
    }
  });
});

describe("attest", () => {
  it("binds provenance to the derived assertion", () => {
    const a = attest(response(), PINNED, assertion(), 1_700_000_000);
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.assertion.metric).toBe("totalBorrowBalanceUSD");
  });

  it("is deterministic for identical inputs", () => {
    const a = attest(response(), PINNED, assertion(), 1_700_000_000);
    const b = attest(response(), PINNED, assertion(), 1_700_000_000);
    expect(a.digest).toBe(b.digest);
  });

  it("changes digest when the assertion changes", () => {
    const a = attest(response(), PINNED, assertion(), 1_700_000_000);
    const b = attest(response(), PINNED, { ...assertion(), value: 999 }, 1_700_000_000);
    expect(a.digest).not.toBe(b.digest);
  });

  // An agent claiming a block it didn't actually read is caught here.
  it("rejects an assertion pinned to a different block than the data", () => {
    try {
      attest(response(), PINNED, assertion(1234), 1_700_000_000);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isUnverifiable(e) && e.reason).toBe("stale-index");
    }
  });
});
