import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perjury — verification for AI agent claims",
  description:
    "An AI agent posts a claim with a bond. A peer it cannot choose re-derives the answer. A confidential workflow publishes only a verdict.",
};

/**
 * Pages read live Sepolia state, but re-reading it on every request meant 16-20s
 * loads — ten getLogs calls plus a timestamp lookup per block. State only changes
 * when a scene runs, so a short revalidation window is honest and fast. The
 * footer says how fresh the numbers are.
 */
export const revalidate = 30;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <a className="brand" href="/">Perjury</a>
          <a href="/roster">Roster</a>
          <a href="/claims">Claims</a>
          <a href="/replay">Replay</a>
          <a href="https://github.com/krishnan74/perjury">Source</a>
          <span className="spacer" />
          <span className="chip">Sepolia · live</span>
        </nav>
        {children}
        <footer className="foot">
          <div className="wrap" style={{ padding: 0 }}>
            Every figure on this site is read from Sepolia at request time. Nothing is cached, seeded, or
            reconstructed — if the chain disagrees with a number here, the chain is right.
          </div>
        </footer>
      </body>
    </html>
  );
}
