import { describe, expect, it } from "vitest";
import { deriveMetric } from "../src/index.js";

/**
 * The metric name reaches this function as free text an LLM composed, so the
 * matcher has to tolerate how it is spelled without tolerating what it means.
 */
const rows = {
  lendingProtocols: [{ totalBorrowBalanceUSD: "40", totalDepositBalanceUSD: "100" }],
};

describe("deriveMetric", () => {
  it("computes a ratio from its components rather than reading it", () => {
    expect(deriveMetric(rows, "utilizationRatio")).toBeCloseTo(40);
  });

  // A real run failed here: the claimant wrote "utilisationRatio", the matcher
  // missed it, the lookup fell through to a field that does not exist, and the
  // witness returned Unverifiable. The parties had not disagreed about anything.
  it("accepts both spellings of utilisation", () => {
    expect(deriveMetric(rows, "utilisationRatio")).toBeCloseTo(40);
    expect(deriveMetric(rows, "Utilisation Ratio")).toBeCloseTo(40);
    expect(deriveMetric(rows, "UTILIZATION")).toBeCloseTo(40);
  });

  it("still fails closed on a metric it cannot find", () => {
    expect(() => deriveMetric(rows, "somethingElse")).toThrow(/missing or non-numeric/);
  });

  it("refuses to divide by zero deposits rather than returning a number", () => {
    const empty = { lendingProtocols: [{ totalBorrowBalanceUSD: "1", totalDepositBalanceUSD: "0" }] };
    expect(() => deriveMetric(empty, "utilization")).toThrow(/utilization undefined/);
  });
});
