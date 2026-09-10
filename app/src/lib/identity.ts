/**
 * Giving each agent a face, without inventing one.
 *
 * The agents are separate processes with separate keys and no channel between
 * them, and the site has been rendering them as interchangeable grey strings.
 * A viewer cannot follow an argument about independence between parties they
 * cannot tell apart.
 *
 * So each agent gets a mark and a colour. Both are DERIVED, never assigned: the
 * monogram comes from the ENS label the agent actually registered, and the hue
 * from its address. The same agent therefore carries the same identity on every
 * page and in every run, and nothing here is a name we made up. There is no
 * persona, no avatar and no invented character, because the honest thing an
 * agent has is a name on chain and a role in this claim.
 *
 * The role leads and the name follows. On the current deployment the claimant of
 * claim 19 is `witness-a.perjury.eth` and its witness is `panel-2.perjury.eth`,
 * which reads as nonsense until you know the labels are deployment slots rather
 * than jobs. Showing CLAIMANT and WITNESS first removes that confusion without
 * putting a name on screen that is not the name on chain.
 */

export type Role = "claimant" | "witness" | "juror" | "protocol";

export interface Identity {
  /** One or two characters, from the ENS label. Never from the address. */
  monogram: string;
  /** A stable hue in degrees, derived from the address. */
  hue: number;
  /** The name as registered. Always shown; never replaced by the monogram. */
  name: string;
  address: string;
  role: Role;
}

/**
 * `witness-a.perjury.eth` becomes WA, `operator.perjury.eth` becomes OP,
 * `panel-1.perjury.eth` becomes P1. Readable at a glance and traceable back to
 * the real label, which an address-derived glyph would not be.
 */
export function monogramOf(name: string): string {
  const label = name.split(".")[0] ?? name;
  const parts = label.split(/[-_]/).filter(Boolean);

  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[1]!;
    // A trailing number is more distinguishing than its first letter: panel-1
    // and panel-2 must not both read P.
    return (a + (/^\d/.test(b) ? b[0]! : b[0]!)).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

/**
 * A hue from the address, so the colour is a property of the agent rather than
 * of its position in a list. Two agents swapping roles between claims keep their
 * colours, which is what makes the roster legible across pages.
 */
export function hueOf(address: string): number {
  const hex = address.replace(/^0x/, "").toLowerCase();
  let h = 0;
  for (let i = 0; i < hex.length; i++) h = (h * 31 + hex.charCodeAt(i)) % 360;
  // Skirt the band used by --accent and --mismatch, so an agent's colour is
  // never mistaken for the page's own emphasis or for a verdict.
  return h >= 5 && h <= 30 ? (h + 120) % 360 : h;
}

export function identityOf(name: string, address: string, role: Role): Identity {
  return { monogram: monogramOf(name), hue: hueOf(address), name, address, role };
}

/**
 * Where an agent's name can actually be looked up.
 *
 * NOT app.ens.domains. These names live on the ENSv2 hackathon deployment, not
 * production ENS, so the mainstream app would show nothing for them — a link
 * that 404s on a site whose whole argument is that every claim can be checked is
 * worse than no link. This is the ENS team's own explorer for that deployment;
 * the URL mirrors ENS_HACKATHON_URLS.explorer in packages/ens.
 */
export const ENS_EXPLORER = "https://hackathon-deployment-portal-app.ens-cf.workers.dev";

export const ensUrl = (name: string) => `${ENS_EXPLORER}/${name}`;

export const ROLE_LABEL: Record<Role, string> = {
  claimant: "Claimant",
  witness: "Witness",
  juror: "Juror",
  protocol: "On chain",
};
