/**
 * Who may cause a claim.
 *
 * Every other route here is read-only and public, which is the right default for
 * a project asking to be checked. This one spends money: each claim moves a bond
 * out of a funded wallet, pays for an indexer read and a model call, and cannot
 * be undone. An open endpoint that does that is a way to drain the agents, and
 * the damage would look exactly like the protocol working.
 *
 * A shared password rather than accounts. Judges are the audience, they arrive
 * with a link and a few minutes, and anything requiring a sign-up would cost
 * more than it protects. It is not an identity system and is not claimed to be
 * one: it is a shared secret that keeps a public URL from being a faucet.
 *
 * Leaving the password unset leaves the gate open, which is correct for local
 * development and, on ETHGlobal's advice, correct for the judged deployment too:
 * "the harder you make it for Partners to use / test your project the lower your
 * chances are of winning a bounty." So the shipped configuration is open, and the
 * thing the password was really protecting — a paid model key that a single
 * enthusiastic afternoon could drain — is protected by a daily cap instead.
 *
 * A cap is the better instrument anyway. A password stops everyone who does not
 * have it, including the people we want; a cap stops nobody until the money is
 * actually gone, and then says so plainly instead of failing like a bug.
 */
import { get, set } from "./store";

const PASSWORD = () => process.env.PERJURY_SUBMIT_PASSWORD;

export const gateEnabled = (): boolean => Boolean(PASSWORD());

/**
 * Constant-time comparison.
 *
 * A short shared secret compared with `===` leaks its length and prefix to
 * anyone willing to measure, and the fix costs four lines.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function passwordOk(supplied: string | null): boolean {
  const expected = PASSWORD();
  if (!expected) return true;
  return typeof supplied === "string" && sameSecret(supplied, expected);
}

/**
 * Claims per UTC day, across everyone.
 *
 * Each claim pays for a model call, two indexer reads and four transactions, so
 * the ceiling is money rather than load. Twenty-five is roughly a day of
 * genuine trying by several people at once and well short of a bill worth
 * caring about. Set `PERJURY_DAILY_CLAIM_LIMIT` to change it, or `0` to lift it.
 */
const DAILY_LIMIT = () => {
  const raw = process.env.PERJURY_DAILY_CLAIM_LIMIT;
  const n = raw === undefined ? 25 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 25;
};

/** Counter key. Dated, so it resets itself and no cron has to. */
const budgetKey = (): string => `live:budget:${new Date().toISOString().slice(0, 10)}`;

export interface Budget {
  used: number;
  limit: number;
  remaining: number;
}

export async function budget(): Promise<Budget> {
  const limit = DAILY_LIMIT();
  const used = Number((await get(budgetKey())) ?? 0) || 0;
  return { used, limit, remaining: limit === 0 ? Infinity : Math.max(0, limit - used) };
}

/**
 * Spend one claim against today's budget, or refuse.
 *
 * Counted at the point a claim is drafted rather than when it settles, because
 * drafting is the step that makes the model call — a run abandoned halfway has
 * still cost what the cap exists to bound.
 */
export async function spendFromBudget(): Promise<Budget | null> {
  const limit = DAILY_LIMIT();
  if (limit === 0) return { used: 0, limit: 0, remaining: Infinity };
  const key = budgetKey();
  const used = Number((await get(key)) ?? 0) || 0;
  if (used >= limit) return null;
  await set(key, String(used + 1));
  return { used: used + 1, limit, remaining: limit - used - 1 };
}

const LOCK = "live:lock";
/**
 * Long enough to cover a claim, short enough that a crashed run frees itself.
 *
 * A lock with no expiry is a lock that one failed request holds forever, and the
 * only way out is a deploy.
 */
const LOCK_MS = 10 * 60_000;

/**
 * One claim in flight at a time.
 *
 * Not a rate limit. Two claimants racing for the same next claim id produce one
 * transaction that reverts, and past that, a page that anyone can hold open is a
 * page that can spend every wallet in parallel. The password is the main defence
 * and this is the one that survives the password being shared.
 */
export async function acquireLock(runId: string): Promise<boolean> {
  const held = await get(LOCK);
  if (held) {
    const { at, runId: owner } = JSON.parse(held) as { at: number; runId: string };
    if (owner !== runId && Date.now() - at < LOCK_MS) return false;
  }
  await set(LOCK, JSON.stringify({ at: Date.now(), runId }));
  return true;
}

export const releaseLock = (): Promise<void> => set(LOCK, "");
