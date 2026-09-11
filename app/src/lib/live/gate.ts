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
 * development and wrong for a deployment. The submit page says which it is, so
 * an unset password is visible rather than silent.
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
