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
import { gatewayUrlFor, recordGatewayUrl } from "@/lib/gateway-index";

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

  const url = await gatewayUrlFor(claimId);
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

/**
 * Tell the gateway where a claim's evidence went.
 *
 * An agent publishes from wherever it runs, which is not this server. Without
 * this, a deployed workflow could only ever adjudicate claims whose URL happened
 * to ship in the build — every claim made afterwards would be invisible to it,
 * which defeats the point of the workflow finding its own work.
 *
 * Authenticated, unlike the GET. The GET serves ciphertext to an enclave that
 * carries no credentials, so it has to be open. This one changes where the
 * tribunal looks for evidence, and an open version of it would let anyone point
 * the tribunal at a bundle of their own choosing. The envelope would refuse to
 * open under the wrong claim id, so the attack is a denial of service rather
 * than a forged verdict — still not something to leave unlocked.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const { claimId } = await params;
  const expected = process.env.PERJURY_GATEWAY_TOKEN;

  // No token configured means no writes, rather than no check. A deployment that
  // forgot to set it must not silently accept anonymous ones.
  if (!expected) {
    return NextResponse.json({ error: "gateway writes are not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!/^\d+$/.test(claimId)) {
    return NextResponse.json({ error: "claim id must be a number" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  // Only the two hosts we actually publish to. A URL is what the enclave will
  // fetch, so accepting an arbitrary one makes this a request-forgery lever.
  if (!body?.url || !/^https:\/\/(gist\.githubusercontent\.com|gist\.github\.com)\//.test(body.url)) {
    return NextResponse.json(
      { error: "url must be a gist.githubusercontent.com address" },
      { status: 400 },
    );
  }

  await recordGatewayUrl(claimId, body.url);
  return NextResponse.json({ ok: true, claimId });
}
