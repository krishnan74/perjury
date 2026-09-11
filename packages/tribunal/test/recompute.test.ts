import { describe, expect, it } from "vitest";
import { recompute } from "../src/index";

/**
 * The metric name is written by a model, so it varies between runs.
 *
 * A false claim came back Unverifiable on a live run because the agent named
 * the metric "totalBorrowBalanceUSD / totalDepositBalanceUSD" rather than
 * "utilizationRatio". Neither side recomputed, so the tribunal declined to
 * judge a claim that was plainly false — the worst way to be wrong, because it
 * looks like caution.
 */
const lending = (borrowed: number, deposited: number) => ({
  lendingProtocols: [{
    totalBorrowBalanceUSD: String(borrowed),
    totalDepositBalanceUSD: String(deposited),
  }],
});

const dex = (volume: number, tvl: number) => ({
  dexAmmProtocols: [{
    cumulativeVolumeUSD: String(volume),
    totalValueLockedUSD: String(tvl),
  }],
});

describe("recompute accepts the ways a model names a ratio", () => {
  for (const metric of [
    "utilizationRatio",
    "utilisation ratio",
    "utilization ratio (total borrowed / total deposited)",
    "totalBorrowBalanceUSD / totalDepositBalanceUSD",
    "total borrowed over total deposited",
  ]) {
    it(`derives utilisation from "${metric}"`, () => {
      expect(recompute(lending(40, 100), metric)).toBeCloseTo(40);
    });
  }

  for (const metric of ["turnover", "cumulativeVolumeUSD / totalValueLockedUSD"]) {
    it(`derives turnover from "${metric}"`, () => {
      expect(recompute(dex(500, 100), metric)).toBeCloseTo(5);
    });
  }

  /**
   * Loose matching must not become no matching. A metric naming neither the
   * ratio nor its components falls through to a plain field lookup, and a field
   * that is not there is null rather than a guess.
   */
  it("returns null for a metric it cannot derive", () => {
    expect(recompute(lending(40, 100), "somethingElseEntirely")).toBeNull();
  });
});
