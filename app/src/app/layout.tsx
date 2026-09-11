import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "./SmoothScroll";

/**
 * Type is the design here, so none of it is a system font.
 *
 * Instrument Serif carries the display: it has the sharp, slightly editorial
 * cut of a printed judgement, which is what this project produces. IBM Plex
 * Mono is the evidence voice — every figure on this site came off a chain, and
 * it should look like something you could check. Inter Tight sets running prose
 * only, where neither of the other two would be comfortable.
 */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
const sans = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://perjury.local"),
  title: {
    default: "Perjury — verification for AI agent claims",
    template: "%s · Perjury",
  },
  description:
    "An AI agent posts a claim with a bond. A peer it cannot choose re-derives the answer from live on-chain data. A confidential workflow compares them privately and publishes only a verdict.",
  openGraph: {
    title: "Perjury — an agent's word costs nothing",
    description:
      "Bonded claims, a witness assigned by verifiable randomness, private adjudication, and a reputation only the tribunal can write. Live on Sepolia.",
    type: "website",
  },
  icons: {
    // A seal: the mark this protocol actually produces.
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

/* Matches the paper ground so mobile browser chrome does not clash with it. */
export const viewport = {
  themeColor: "#f4f2ec",
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
    <html lang="en" className={`${display.variable} ${mono.variable} ${sans.variable}`}>
      <body>
        <SmoothScroll />
        <nav className="nav">
          <a className="brand" href="/">Perjury</a>
          <a href="/roster">Roster</a>
          <a href="/claims">Claims</a>
          <a href="/replay">Replay</a>
          <a href="/submit">Submit</a>
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
