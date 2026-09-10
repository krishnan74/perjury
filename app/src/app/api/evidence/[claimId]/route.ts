/**
 * The evidence gateway, as the enclave sees it.
 *
 * `GET /api/evidence/<claimId>` returns the sealed bundle for that claim. The
 * confidential workflow fetches this over Confidential HTTP once it has read the
 * claim id off chain for itself.
 *
 * What comes back is ciphertext. The private half of the envelope key lives in
 * the Chainlink Vault DON and is released only into the attested enclave, so
 * this route can be public, and is — the enclave carries no credentials and
 * could not authenticate if we asked it to. A URL was never the access control
 * here; the envelope is.
 *
 * The bytes are proxied from wherever the agent published them rather than
 * stored here. See src/lib/gateway-index.ts for why that distinction is worth
 * the extra hop.
 */
import { NextResponse } from "next/server";
import { gatewayUrlFor } from "@/lib/gateway-index";

/** Reads the filesystem index. Not an edge route. */
export const runtime = "nodejs";

/**
 * Never cached.
 *
 * A claim's evidence appears once and never changes, so caching looks free. It
 * is not: the window this route exists to serve opens the moment a witness
 * publishes, and a cached 404 from thirty seconds earlier would hold the
 * tribunal off the claim for as long as the entry lived.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const { claimId } = await params;

  if (!/^\d+$/.test(claimId)) {
    return NextResponse.json({ error: "claim id must be a number" }, { status: 400 });
  }

  const url = gatewayUrlFor(claimId);
  if (!url) {
    // The ordinary case, not a failure. A witness is assigned the instant the
    // VRF draw fulfils, which is before it has read anything or published
    // anything, so there is a real window where the claim exists and its
    // evidence does not. The workflow treats this as "try the next tick".
    return NextResponse.json(
      { error: `no evidence published for claim ${claimId} yet` },
      { status: 404 },
    );
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `evidence store returned ${upstream.status}` },
      { status: 502 },
    );
  }

  // Passed through verbatim. Re-encoding JSON would change the bytes, and the
  // envelope's authentication tag is over the bytes.
  return new NextResponse(await upstream.text(), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
