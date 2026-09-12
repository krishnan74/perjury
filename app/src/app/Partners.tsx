/**
 * The three protocols this is built on, and where each one does its work.
 *
 * The marks are the OFFICIAL logos, served from `public/partners/` and used
 * unmodified — no recolouring, no redrawing, no tracing. An earlier version
 * drew simplified geometry by hand, which is defensible for a placeholder and
 * not for something a judge from any of these three teams will watch:
 *
 *   chainlink.svg  Simple Icons, the brand's own #375BD2
 *   ens.svg        Simple Icons, the brand's own #0080BC
 *   graph.svg      thegraph.com/brand, "Logomark — Dark", the variant they
 *                  publish for light backgrounds
 *
 * The Graph's logomark ships only in dark and light; there is no coloured
 * variant of it, and the coloured GRT symbol is the token rather than the
 * protocol, so the dark mark is the correct one to use here.
 *
 * Each file keeps its own colour, which is why two of these are blue. Tinting
 * them to a common palette would be a brand violation dressed up as design.
 */

export type PartnerId = "chainlink" | "ens" | "graph";

export interface Partner {
  id: PartnerId;
  name: string;
  /** What it does here, not what it is. */
  layer: string;
  blurb: string;
  colour: string;
  href: string;
}

export const PARTNERS: Record<PartnerId, Partner> = {
  chainlink: {
    id: "chainlink",
    name: "Chainlink",
    layer: "CRE Confidential Workflows · VRF v2.5",
    blurb:
      "CRE runs the adjudication. A TEE handler on a cron trigger reads pendingForTribunal() to find its own claim, fetches both sealed submissions over Confidential HTTP, and opens them with an envelope key the Vault DON releases into the enclave. It recomputes both values from the raw rows rather than trusting either agent's stated conclusion, then writes a verdict and a commitment hash through a Forwarder. Deployed on the DON in an AWS Nitro enclave, settling on chain from there. VRF v2.5 supplies the assignment: every witness and every three-seat appeal panel is drawn from it.",
    colour: "#375bd2",
    href: "https://chain.link",
  },
  ens: {
    id: "ens",
    name: "ENS",
    layer: "ENSv2 · subname registry, per-key Enhanced Access Control",
    blurb:
      "Agent identity and reputation live in ENS rather than in our contracts. A subname registry deployed under perjury.eth issues each agent a subname it owns, and standing is a text record on that name. Enhanced Access Control scopes SET_TEXT per record key: the tribunal's writer holds it on two keys, holds nothing on the record that says whose name it is, and the operator that deployed every contract and owns the parent reverts when it tries. Reads go through ENSIP-10 resolve() — text() reverts on a factory-deployed Permissioned Resolver — and WitnessRoster.isEligible() resolves the record on chain at the moment of the draw.",
    colour: "#0080bc",
    href: "https://ens.domains",
  },
  graph: {
    id: "graph",
    name: "The Graph",
    layer: "Gateway · Subgraph MCP · Messari standardized schemas",
    blurb:
      "The Graph supplies the facts a claim is about, and the agents have no other data source. Each agent uses the Subgraph MCP to find a subgraph, read its schema and compose its own GraphQL, then a deterministic guard decides whether the result may be used at all. Thirteen deployments pinned by content hash, two Messari schema families, five chains, one selection set and one derivation across all of them. Reads are pinned to a block and the served block must match. Where a subject has a second independently written index both are read and must agree within tolerance, or the claim returns Unverifiable rather than a verdict.",
    // The chip tint follows the mark. The Graph's logomark is monochrome, so a
    // purple chip around a near-black logo would look like a mistake.
    colour: "#0c0a1d",
    href: "https://thegraph.com",
  },
};

/**
 * A partner mark at text scale.
 *
 * `aria-hidden` because every use sits beside the partner's name in text. A
 * glyph that repeats the word next to it is noise in a screen reader.
 */
export function PartnerMark({ id, size = 18 }: { id: PartnerId; size?: number }) {
  /*
   * Plain <img>, not next/image and not an inline sprite.
   *
   * These are three small static SVGs on the same origin: there is nothing to
   * optimise, and running a brand's logo through a transform pipeline is how it
   * stops being the logo. `alt` is empty because every use sits beside the
   * partner's name in text, and a glyph that repeats the word next to it is
   * noise in a screen reader.
   */
  return (
    <img
      className="pmark"
      src={`/partners/${id}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * A partner chip, for marking the step where that partner does its work.
 *
 * Named as well as marked. The whole point of putting these on the replay is
 * that a viewer can see which protocol is responsible for the thing that just
 * happened, and a bare glyph makes them guess.
 */
export function PartnerChip({ id }: { id: PartnerId }) {
  const p = PARTNERS[id];
  return (
    <span className="pchip" style={{ ["--pcolour" as string]: p.colour }}>
      <PartnerMark id={id} size={13} />
      {p.name}
    </span>
  );
}

/**
 * The partners section, as a list of who does what rather than a logo wall.
 *
 * The row is not a link. It used to be, and that made the whole block — three
 * paragraphs of the most load-bearing technical detail on the page — one large
 * click target pointing away from the project. A reader who wants chain.link
 * can have it from the mark; a reader who wants to select a sentence should be
 * able to, and a reader skimming should not be invited off the page at the
 * exact moment the substance arrives.
 */
export function PartnerList() {
  return (
    <div className="partners">
      {Object.values(PARTNERS).map((p) => (
        <div className="partner" key={p.id}>
          <a
            className="partner-mark"
            href={p.href}
            target="_blank"
            rel="noreferrer"
            aria-label={p.name}
            title={p.name}
          >
            <PartnerMark id={p.id} size={30} />
          </a>
          <span className="partner-id">
            <b>{p.name}</b>
            <span className="partner-layer">{p.layer}</span>
          </span>
          <span className="partner-blurb">{p.blurb}</span>
        </div>
      ))}
    </div>
  );
}
