import { short } from "@/lib/perjury";
import type { ClaimEvent } from "@/lib/perjury";

/**
 * The receipts, moving.
 *
 * Every hash here is a real transaction from this protocol's own history. It is
 * used as texture, but it is texture the project produced — which argues
 * something a decorative graphic could not. Duplicated once so the track can
 * loop seamlessly at -50%.
 */
export function Ticker({ events }: { events: ClaimEvent[] }) {
  const items = events
    .filter((e) => e.claimId !== "-")
    .slice(-22)
    .map((e) => ({ label: e.name, tx: e.tx, id: e.claimId }));

  if (items.length === 0) return null;
  const loop = [...items, ...items];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {loop.map((it, i) => (
          <span key={`${it.tx}-${i}`}>
            <b>#{it.id}</b> {it.label} · {short(it.tx, 12)}
          </span>
        ))}
      </div>
    </div>
  );
}
