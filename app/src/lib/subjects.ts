/**
 * The subjects a claim may be about.
 *
 * Read from the same pinned-deployments file the agents and the tribunal read,
 * rather than listed again here. A second copy is how the site would end up
 * offering a subject the tribunal's provenance allowlist rejects, which looks
 * like the protocol failing and is really the page lying.
 *
 * Read through the filesystem rather than imported, because the app's module
 * resolution does not reach into the workspace package's JSON and a build-time
 * import is not worth a tsconfig argument.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Subject {
  subject: string;
  chain: string;
  /** Human name of the protocol the claim is about. */
  protocolName: string;
  /** Messari schema family. Two of them cover all thirteen deployments. */
  schema: string;
  /**
   * The pinned deployment id — a content hash of the mapping code.
   *
   * Surfaced to the reader because it is the whole reason two reads can be
   * called independent. A subgraph redeploying under the same name serves a
   * different hash, which is the substitution the guard rejects, and none of
   * that is visible if the picker only offers a slug.
   */
  deploymentId: string;
  /** Other deployments independently indexing the same protocol. */
  corroborators: number;
  /** Metrics the standardized query pattern exposes for this subject. */
  metrics: string[];
}

const ROOTS = [join(process.cwd(), ".."), process.cwd()];

export function pinnedSubjects(): Subject[] {
  for (const root of ROOTS) {
    try {
      const raw = readFileSync(
        join(root, "packages", "shared", "src", "pinned-deployments.json"),
        "utf8",
      );
      const { deployments } = JSON.parse(raw) as {
        deployments: (Subject & { corroborators?: unknown[] })[];
      };
      return deployments.map((d) => ({
        subject: d.subject,
        chain: d.chain,
        protocolName: d.protocolName,
        schema: d.schema,
        deploymentId: d.deploymentId,
        corroborators: (d.corroborators ?? []).length,
        metrics: d.metrics ?? [],
      }));
    } catch {
      // Try the next root.
    }
  }
  return [];
}

export const isPinnedSubject = (s: string): boolean =>
  pinnedSubjects().some((p) => p.subject === s);
