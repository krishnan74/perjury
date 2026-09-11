/**
 * State that has to survive between requests.
 *
 * A serverless deployment has no disk worth writing to and no memory that
 * outlives a request. The previous version kept the gateway index in `/tmp`,
 * which is private to one instance: a write and a later read can land on
 * different machines, and the failure looks like evidence that was never
 * published.
 *
 * Two things need to persist, and they are small: which store holds a claim's
 * evidence, and where a submission has got to. Both are keyed by claim id.
 *
 * Three backends, chosen by what the environment offers rather than by a flag,
 * because a flag is one more thing to set wrong:
 *
 *   - Upstash Redis over its REST API, when the URL and token are present. This
 *     is what Vercel's KV integration provisions, and REST rather than a socket
 *     because a serverless function should not be opening connections it cannot
 *     close.
 *   - A file, when neither is set and the filesystem is writable. This is the
 *     local case, and it keeps `npm run dev` working with no services.
 *   - Memory, as the last resort, so a missing configuration degrades to
 *     "forgets between requests" rather than crashing on import.
 *
 * Everything here is public: a claim id, a gist URL, a status string. Nothing
 * secret is stored, and the evidence itself lives elsewhere and is ciphertext.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const FILE = process.env.PERJURY_STORE_FILE ?? "/tmp/perjury-live-store.json";

export const storeBackend = (): "redis" | "file" | "memory" =>
  REDIS_URL && REDIS_TOKEN ? "redis" : "file";

const memory = new Map<string, string>();

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(`${REDIS_URL}`, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).result;
}

function readFile(): Record<string, string> {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, string>;
  } catch {
    // A corrupt store must not take the route down. An empty one produces a
    // "not found", which every caller already handles.
    return {};
  }
}

function writeFileSafe(all: Record<string, string>): boolean {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, `${JSON.stringify(all, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

export async function get(key: string): Promise<string | null> {
  if (storeBackend() === "redis") return ((await redis(["GET", key])) as string | null) ?? null;
  const fromFile = readFile()[key];
  if (fromFile !== undefined) return fromFile;
  return memory.get(key) ?? null;
}

export async function set(key: string, value: string): Promise<void> {
  if (storeBackend() === "redis") {
    await redis(["SET", key, value]);
    return;
  }
  const all = readFile();
  all[key] = value;
  // Memory is written either way, so a read in this same request still sees it
  // even when the filesystem refused.
  memory.set(key, value);
  writeFileSafe(all);
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const setJson = (key: string, value: unknown): Promise<void> =>
  set(key, JSON.stringify(value));
