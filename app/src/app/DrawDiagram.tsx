import type { ClaimRow } from "@/lib/perjury";
import type { Agent } from "@/lib/roster";

/**
 * Every witness draw that has actually happened.
 *
 * Agents sit on a line; each arc runs from the claimant to the witness the VRF
 * assigned. This is not an illustration of the mechanism — it is the mechanism's
 * output, read from `WitnessAssigned` logs, so the shape changes as claims settle.
 *
 * The point it makes visually: no arc ever returns to where it started. A
 * claimant is never its own witness, and the arcs fan out rather than clustering
 * into pairs, which is what "you cannot choose your auditor" looks like when you
 * draw it.
 */
export function DrawDiagram({ claims, roster }: { claims: ClaimRow[]; roster: Agent[] }) {
  const drawn = claims.filter((c) => c.witness);
  if (drawn.length === 0 || roster.length === 0) return null;

  const W = 1000;
  const H = 260;
  const padX = 90;
  const baseY = H - 54;
  const step = roster.length > 1 ? (W - padX * 2) / (roster.length - 1) : 0;
  const xOf = (addr: string) => {
    const i = roster.findIndex((a) => a.address.toLowerCase() === addr.toLowerCase());
    return i < 0 ? W / 2 : padX + i * step;
  };

  const stroke: Record<string, string> = {
    Match: "var(--match)",
    Mismatch: "var(--mismatch)",
    Unverifiable: "var(--unverifiable)",
    None: "var(--muted)",
  };

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Arc diagram of ${drawn.length} witness draws across ${roster.length} agents. No arc connects an agent to itself.`}
        style={{ display: "block", overflow: "visible" }}
      >
        {drawn.map((c) => {
          const x1 = xOf(c.claimant);
          const x2 = xOf(c.witness!);
          // Height scales with distance so overlapping arcs stay distinguishable.
          const r = Math.abs(x2 - x1) / 2;
          const lift = Math.min(baseY - 18, 34 + r * 0.62);
          return (
            <path
              key={c.id}
              d={`M ${x1} ${baseY} A ${r} ${lift} 0 0 ${x2 > x1 ? 1 : 0} ${x2} ${baseY}`}
              fill="none"
              stroke={stroke[c.verdict] ?? "var(--muted)"}
              strokeWidth={1.4}
              opacity={0.72}
            />
          );
        })}

        <line x1={padX - 34} y1={baseY} x2={W - padX + 34} y2={baseY} stroke="var(--rule)" strokeWidth={1} />

        {roster.map((a) => {
          const x = xOf(a.address);
          const label = a.name.replace(".perjury.eth", "");
          return (
            <g key={a.address}>
              <circle cx={x} cy={baseY} r={4.5} fill={a.eligible ? "var(--ink)" : "var(--mismatch)"} />
              <text
                x={x}
                y={baseY + 26}
                textAnchor="middle"
                fill="var(--muted)"
                style={{ font: "500 12px var(--mono)", letterSpacing: "0.04em" }}
              >
                {label}
              </text>
              {!a.eligible && (
                <text
                  x={x}
                  y={baseY + 42}
                  textAnchor="middle"
                  fill="var(--mismatch)"
                  style={{ font: "500 10px var(--mono)", letterSpacing: "0.08em" }}
                >
                  EXCLUDED
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="note" style={{ marginTop: "1.2rem", borderLeft: 0, paddingLeft: 0 }}>
        {drawn.length} draws across {roster.length} agents, read from{" "}
        <span className="mono">WitnessAssigned</span> logs. Every arc leaves one agent and lands on
        another — none returns to where it started, because a claimant can never be drawn to check
        itself. Colour is the verdict that followed.
      </figcaption>
    </figure>
  );
}
