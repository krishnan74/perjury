import Link from "next/link";

export const metadata = { title: "No such record" };

/**
 * A designed 404, not a default one.
 *
 * The page a project ships for its own mistakes says as much about its care as
 * the happy path. This one stays in character — a tribunal that cannot find a
 * record says so plainly and points at the index.
 */
export default function NotFound() {
  return (
    <main className="wrap section" style={{ minHeight: "60vh" }}>
      <span className="chapter-num" aria-hidden="true">404</span>
      <p className="eyebrow">No such record</p>
      <h1 className="h2" style={{ maxWidth: "20ch" }}>
        Nothing was ever filed under that.
      </h1>
      <p className="lede" style={{ marginTop: "1.4rem" }}>
        Either the claim does not exist, or it settled outside the window this site reads. Every claim
        the registry has adjudicated is listed on the index.
      </p>
      <div className="actions">
        <Link className="btn" href="/claims">Every claim</Link>
        <Link className="btn ghost" href="/">Back to the start</Link>
      </div>
    </main>
  );
}
