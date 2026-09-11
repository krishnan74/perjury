import { claimEvents, claimsIndex, eth, short, EXPLORER, SINK } from "@/lib/perjury";
import { deploymentById } from "@/lib/deployments";
import { rosterSnapshot } from "@/lib/roster";
import { notFound } from "next/navigation";
import { Redacted } from "../Redacted";

export const revalidate = 30;

const STAGE_LABEL: Record<string, string> = {
  ClaimSubmitted: "Claim submitted, bond escrowed",
  WitnessAssigned: "VRF drew the witness",
  VerdictRecorded: "Tribunal returned a verdict",
  Appealed: "Claimant appealed",
  PanelSeated: "VRF seated a panel of three",
  PanelUpheld: "Panel upheld the verdict",
  PanelOverturned: "Panel overturned the verdict",
  ClaimantSlashed: "Claimant slashed",
  WitnessPaid: "Witness paid its flat fee",
  Settled: "Settled",
};

export default async function ClaimDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { id } = await params;
  // An id alone does not identify a claim: ids restart with every cascade.
  const { d } = await searchParams;
  const deployment = deploymentById(d);
  const [events, roster] = await Promise.all([
    claimEvents(undefined, deployment),
    rosterSnapshot(deployment),
  ]);
  const claim = claimsIndex(events).find((c) => c.id === id);
  if (!claim) notFound();

  const name = (addr: string | null) =>
    roster.find((a) => a.address.toLowerCase() === (addr ?? "").toLowerCase())?.name ?? short(addr ?? "—", 8);

  const verdictEvent = claim.events.find(
    (e) => e.name === "VerdictRecorded" || e.name === "PanelUpheld" || e.name === "PanelOverturned",
  );
  const commitment = String(
    claim.events.find((e) => e.name === "VerdictRecorded")?.args.evidenceCommitment ?? "",
  );

  return (
    <main className="wrap section">
      <p className="eyebrow">Claim #{claim.id}</p>
      <h1 className="h2" style={{ maxWidth: "22ch" }}>
        {claim.verdict === "None" ? "Still open." : `The tribunal returned ${claim.verdict}.`}
      </h1>

      <div className="actions" style={{ marginBottom: "2.4rem" }}>
        <span className={`verdict v-${claim.verdict}`} style={{ padding: "0.5rem 0.8rem" }}>
          {claim.verdict === "None" ? "pending" : claim.verdict}
        </span>
        {claim.appealed && <span className="chip">appealed &middot; panel of {claim.panel.length}</span>}
        {claim.slashed && <span className="chip" style={{ color: "var(--mismatch)" }}>claimant slashed</span>}
      </div>

      <div className="cols">
        <div className="col-published">
          <p className="eyebrow">Published on chain</p>
          <p className="note" style={{ marginBottom: "1.2rem" }}>
            The entire report. Four fields, delivered by a Chainlink Forwarder to a sink that accepts
            one immutable sender.
          </p>
          <dl className="defs">
            <dt>claim id</dt>
            <dd>{claim.id}</dd>
            <dt>verdict</dt>
            <dd>{claim.verdict}</dd>
            <dt>evidence commitment</dt>
            <dd>{commitment ? short(commitment, 18) : "—"}</dd>
            <dt>delivered to</dt>
            <dd>
              <a href={`${EXPLORER}/address/${SINK}`}>{short(SINK, 12)}</a>
            </dd>
          </dl>
        </div>

        {/*
          The reason this page exists. A verdict alone reads like any other
          status field; the mechanism only becomes visible when you put it next
          to everything that was deliberately withheld. The bars are real — none
          of these values appear in any transaction, and the commitment above is
          the only trace they leave.
        */}
        <div className="col-sealed">
          <p className="eyebrow">Sealed in the enclave</p>
          {/*
            This has been wrong twice. It first read "Publishing it would hand
            the next claimant a rubric", which stated the intended design as
            present fact while the gateway store was an unencrypted gist. It
            then described that gap — which was accurate for about an hour,
            until the store was sealed. It now describes what is actually
            deployed, and the one remaining reason any of it is legible.
          */}
          <p className="note" style={{ marginBottom: "1.2rem" }}>
            None of this reached the chain. The report carries a verdict and a commitment, and the
            commitment is a hash &mdash; it proves the tribunal judged these exact inputs without
            revealing any of them.
          </p>
          <p className="note" style={{ marginBottom: "1.2rem" }}>
            The bundle reaches the tribunal <b>sealed</b>: encrypted to a key whose private half the
            Chainlink Vault DON releases only into the attested enclave. The gateway that stores it is
            a public URL and holds nothing readable. Neither party ever sees the other&rsquo;s work.
          </p>
          <p className="note" style={{ marginBottom: "1.2rem" }}>
            On this testnet the runner additionally keeps a local copy of each settled bundle, so the{" "}
            <a href={`/replay?claim=${claim.id}`}>replay</a> can show what the agents actually did.
            That is a demo affordance and the only reason any of it is legible.
          </p>
          <dl className="defs">
            <dt>claimant&rsquo;s value</dt>
            <dd><Redacted ch={14} label="claimant's value" /></dd>
            <dt>witness&rsquo;s value</dt>
            <dd><Redacted ch={13} label="witness's value" /></dd>
            <dt>claimant&rsquo;s evidence</dt>
            <dd><Redacted ch={34} label="claimant's evidence" /></dd>
            <dt>witness&rsquo;s evidence</dt>
            <dd><Redacted ch={31} label="witness's evidence" /></dd>
            <dt>methodologies</dt>
            <dd><Redacted ch={29} label="methodologies" /></dd>
            <dt>query hashes</dt>
            <dd><Redacted ch={20} label="query hashes" /></dd>
          </dl>
        </div>
      </div>

      <section style={{ marginTop: "3.5rem" }}>
        <p className="eyebrow">What happened, in order</p>
        <div className="stages">
          {claim.events.map((e) => (
            <div className="stage" data-state="done" key={`${e.name}-${e.tx}`}>
              <span className="dot" aria-hidden="true">&#9679;</span>
              <span>
                {STAGE_LABEL[e.name] ?? e.name}
                {e.name === "WitnessAssigned" && (
                  <> &mdash; {name(String(e.args.witness))}</>
                )}
                {e.name === "PanelSeated" && (
                  <> &mdash; {(e.args.panel as string[]).map(name).join(", ")}</>
                )}
              </span>
              <a className="when" href={`${EXPLORER}/tx/${e.tx}`}>{short(e.tx, 10)}</a>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <p className="eyebrow">The part worth checking</p>
        <p className="lede">
          The claimant is <span className="mono">{name(claim.claimant)}</span>
          {claim.witness && (
            <>
              {" "}and the witness is <span className="mono">{name(claim.witness)}</span>. They are
              different addresses, and the claimant had no way to influence which
            </>
          )}
          {!claim.witness && " and no witness has been drawn yet"}
          . <span className="mono">submitClaim</span> accepts a subject and a commitment — there is no
          parameter for a witness, so there is no code path by which a claimant could request, hint at
          or bias the draw.
        </p>
        <div className="actions">
          <a className="btn ghost" href={`${EXPLORER}/address/${deployment.registry}`}>Registry on Etherscan</a>
          {verdictEvent && (
            <a className="btn ghost" href={`${EXPLORER}/tx/${verdictEvent.tx}`}>The verdict transaction</a>
          )}
          <a className="btn ghost" href="/claims">All claims</a>
        </div>
      </section>
    </main>
  );
}
