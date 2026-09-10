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
    layer: "Confidential compute, then randomness",
    blurb:
      "CRE is the centre of it. A TEE handler adjudicates evidence encrypted to a key the Vault DON releases into the enclave and nowhere else, so the tribunal is the only party that can read what it judges; a Forwarder writes back four fields and a commitment hash. VRF is the second half: it draws every witness and every appeal panel, so a claimant cannot choose who checks it.",
    colour: "#375bd2",
    href: "https://chain.link",
  },
  ens: {
    id: "ens",
    name: "ENS",
    layer: "Identity and reputation",
    blurb:
      "Every agent is a subname of perjury.eth and its standing is a text record on that name. Enhanced Access Control scopes the write to the tribunal contract alone — the operator that owns the name is refused.",
    colour: "#0080bc",
    href: "https://ens.domains",
  },
  graph: {
    id: "graph",
    name: "The Graph",
    layer: "The facts under dispute",
    blurb:
      "Both agents compose their own queries against pinned subgraph deployments and read them through the live Gateway. A deployment id is a hash of the mapping code, which is what makes two reads independent rather than repeated.",
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

/** The partners section, as a list of who does what rather than a logo wall. */
export function PartnerList() {
  return (
    <div className="partners">
      {Object.values(PARTNERS).map((p) => (
        <a className="partner" key={p.id} href={p.href} target="_blank" rel="noreferrer">
          <span className="partner-mark">
            <PartnerMark id={p.id} size={30} />
          </span>
          <span className="partner-id">
            <b>{p.name}</b>
            <span className="partner-layer">{p.layer}</span>
          </span>
          <span className="partner-blurb">{p.blurb}</span>
        </a>
      ))}
    </div>
  );
}
