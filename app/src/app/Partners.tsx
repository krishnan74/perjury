/**
 * The three protocols this is built on, and where each one does its work.
 *
 * The marks are SIMPLIFIED geometry, not official brand assets — a hexagon for
 * Chainlink, a lozenge for ENS, a node-and-orbit for The Graph. They are drawn
 * here rather than fetched so the page has no third-party asset dependency and
 * nothing to load, and they are deliberately plain: a half-accurate replica of
 * someone's logo is worse than an obvious abstraction of it. Swap in official
 * SVGs before submitting if brand accuracy matters.
 *
 * Brand colour is used at mark size only. The site has one accent and this does
 * not become a second: these are identifiers, and three coloured glyphs at 20px
 * read as marks rather than as palette.
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
    layer: "Randomness and confidential compute",
    blurb:
      "VRF draws every witness and every appeal panel, so a claimant cannot choose who checks it. CRE runs the tribunal in a confidential handler and a Forwarder delivers the signed report on chain.",
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
    colour: "#6747ed",
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
  const colour = PARTNERS[id].colour;
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;

  if (id === "chainlink") {
    return (
      <svg {...common} className="pmark">
        <path
          d="M12 2.6 20.4 7.3v9.4L12 21.4 3.6 16.7V7.3z"
          fill="none"
          stroke={colour}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (id === "ens") {
    return (
      <svg {...common} className="pmark">
        <path
          d="M12 2.2c3.4 4.1 6.6 6.6 6.6 10.6A6.6 6.6 0 0 1 12 21.8a6.6 6.6 0 0 1-6.6-9c0-4 3.2-6.5 6.6-10.6z"
          fill="none"
          stroke={colour}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common} className="pmark">
      <circle cx="10.4" cy="10.4" r="6.4" fill="none" stroke={colour} strokeWidth="2.1" />
      <circle cx="19" cy="19" r="2.6" fill={colour} />
    </svg>
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
