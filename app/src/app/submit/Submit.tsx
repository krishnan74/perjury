"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReplayScript } from "@/lib/replay";
import { hueOf, monogramOf } from "@/lib/identity";
import { PartnerMark } from "../Partners";
import Lanes from "../replay/Lanes";
import Standing from "../replay/Standing";

export interface SubjectOption {
  subject: string;
  chain: string;
  protocolName: string;
  schema: string;
  deploymentId: string;
  corroborators: number;
  metrics: string[];
}

export interface AgentOption {
  /** The ENS label, which is also the key the runner looks a wallet up by. */
  label: string;
  name: string;
  address: string;
  standing: number;
  publiclyResolvable: boolean;
}

interface RunState {
  runId: string;
  phase: "drafted" | "submitted" | "assigned" | "sealed" | "adjudicated" | "settled";
  subject: string;
  claimant: string;
  text: string;
  claimHash: string;
  claimedValue: number | null;
  claimId?: string;
  submitTx?: string;
  witnessAgent?: { name: string; address: string };
  witnessValue?: number | null;
  gatewayUrl?: string;
  verdict?: string;
  finalizeTx?: string;
  startedAt: number;
}

/**
 * The phases, only as a status line.
 *
 * This page used to render these six as its own numbered list, with a sentence
 * of prose under each. That was a second and much thinner account of the same
 * protocol: the replay could show which rows an agent read and this page could
 * only say that it had read some, which meant the version a judge watches
 * happen live was the less convincing of the two.
 *
 * The account is now the replay's, rendered from the same builder against the
 * claim that is currently running. What survives here is the one thing a live
 * page needs and a replay does not — which stage is in progress, and what it is
 * waiting on, so a minute of no visible movement reads as VRF rather than as a
 * page that has stopped working.
 */
const PHASES = [
  { phase: "drafted", label: "Reading the indexer" },
  { phase: "submitted", label: "Bonded, waiting on the draw" },
  { phase: "assigned", label: "Checker drawn" },
  { phase: "sealed", label: "Both halves sealed" },
  { phase: "adjudicated", label: "Verdict returned" },
  { phase: "settled", label: "Settled" },
] as const;

const phaseIndex = (p: string) => PHASES.findIndex((b) => b.phase === p);

/** Schema family, as a reader would say it rather than as the file spells it. */
const SCHEMA_LABEL: Record<string, string> = {
  "messari-lending": "Messari lending",
  "messari-dex": "Messari DEX",
};

const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-6)}`;

/**
 * What a claim about this subject will actually assert.
 *
 * Per schema family, not one label for all thirteen: a DEX subgraph has no
 * borrow or deposit fields, so a card promising a utilization ratio was
 * describing a number that subject cannot produce.
 */
const CLAIM_METRIC: Record<string, string> = {
  "messari-lending": "utilization ratio",
  "messari-dex": "total value locked",
};

/**
 * Choosing a subject is choosing a subgraph, so the card says so.
 *
 * A dropdown of slugs hid the only part of this step that is interesting. What
 * a claim is *about* is a pinned Graph deployment, and the deployment id is a
 * content hash of the mapping code — which is the entire reason two agents
 * reading it can be said to have derived an answer independently rather than
 * repeated one source. None of that survives being collapsed into
 * `aave-v3-ethereum`.
 *
 * The corroborator count is shown where it exists and its absence is shown
 * where it does not, because one of thirteen subjects has a genuine second
 * index and pretending otherwise would be the easiest lie on this page.
 */
function SubjectCard({
  s,
  selected,
  disabled,
  onSelect,
}: {
  s: SubjectOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="pick"
      data-selected={selected}
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="pick-head">
        <b>{s.protocolName}</b>
        <span className="pick-chain">{s.chain}</span>
      </span>
      <span className="pick-metric">{CLAIM_METRIC[s.schema] ?? "utilization ratio"}</span>
      <span className="pick-meta">
        <span className="pick-schema">{SCHEMA_LABEL[s.schema] ?? s.schema}</span>
        {s.corroborators > 0 ? (
          <span className="pick-corrob">{s.corroborators + 1} independent indexes</span>
        ) : (
          <span className="pick-single">single index</span>
        )}
      </span>
      <span className="pick-id mono" title={s.deploymentId}>
        {short(s.deploymentId)}
      </span>
    </button>
  );
}

/**
 * Choosing a claimant is choosing a name with a history.
 *
 * Standing is the thing this protocol exists to move, so it belongs on the
 * card rather than behind a slug — a reader picking an agent on −6 should be
 * able to see that they are picking one that has already been caught.
 */
function AgentCard({
  a,
  selected,
  disabled,
  onSelect,
}: {
  a: AgentOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="pick pick-agent"
      data-selected={selected}
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      style={{ ["--agent-hue" as string]: String(hueOf(a.address)) }}
    >
      <span className="pick-mono" aria-hidden="true">{monogramOf(a.name)}</span>
      <span className="pick-agent-id">
        <b>{a.name}</b>
        <span className="pick-agent-meta">
          standing <b data-down={a.standing < 0}>{a.standing > 0 ? `+${a.standing}` : a.standing}</b>
          {a.publiclyResolvable && <span className="pick-resolves">resolves publicly</span>}
        </span>
      </span>
    </button>
  );
}

export default function Submit({
  subjects,
  agents,
  gated,
  runnable,
}: {
  subjects: SubjectOption[];
  agents: AgentOption[];
  /** Whether this deployment requires the shared password to spend anything. */
  gated: boolean;
  /**
   * Whether this deployment has what a run needs.
   *
   * The button used to be live regardless, and a deployment missing a
   * credential answered a press with a 503. An offer that cannot be honoured is
   * worse than no offer, so it is disabled here and the page says so above.
   */
  runnable: boolean;
}) {
  const [subject, setSubject] = useState(subjects[0]?.subject ?? "aave-v3-ethereum");
  const [claimant, setClaimant] = useState(agents[0]?.label ?? "operator");
  const [run, setRun] = useState<RunState | null>(null);
  const [script, setScript] = useState<ReplayScript | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  // True elapsed time. A claim that took six minutes says six minutes.
  useEffect(() => {
    if (!busy || !run) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - run.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy, run]);

  /**
   * Poll the script independently of the step machine.
   *
   * The steps advance when work finishes; beats appear when the chain says so,
   * and those are not the same moment. Polling separately means the draw shows
   * up the second VRF fulfils rather than when the next step happens to run,
   * and a stage that is only waiting still has something arriving on screen.
   */
  const refreshScript = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/live-script?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { script: ReplayScript | null };
      if (!cancelled.current && json.script) setScript(json.script);
    } catch {
      // A missed poll costs one refresh. The next one is four seconds away, and
      // failing the claim because a read timed out would be absurd.
    }
  }, []);

  useEffect(() => {
    if (!busy || !run?.runId) return;
    const id = setInterval(() => void refreshScript(run.runId), 4000);
    return () => clearInterval(id);
  }, [busy, run?.runId, refreshScript]);

  const call = useCallback(async (body: Record<string, unknown>): Promise<RunState> => {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-perjury-password": password },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `step failed (${res.status})`);
    return json as RunState;
  }, [password]);

  /** Poll a step that is waiting on the chain rather than doing work. */
  const pollUntil = useCallback(
    async (runId: string, step: string, done: (s: RunState) => boolean, label: string, timeoutMs: number) => {
      setWaitingFor(label);
      const started = Date.now();
      for (;;) {
        if (cancelled.current) throw new Error("cancelled");
        const s = await call({ step, runId });
        setRun(s);
        if (done(s)) {
          setWaitingFor(null);
          return s;
        }
        if (Date.now() - started > timeoutMs) {
          setWaitingFor(null);
          throw new Error(`still waiting on ${label} after ${Math.round(timeoutMs / 1000)}s`);
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    },
    [call],
  );

  const start = async () => {
    cancelled.current = false;
    setError(null);
    setRun(null);
    setScript(null);
    setElapsed(0);
    setBusy(true);
    try {
      const drafted = await call({ step: "draft", subject, claimant });
      setRun(drafted);

      const submitted = await call({ step: "submit", runId: drafted.runId });
      setRun(submitted);
      await refreshScript(submitted.runId);

      await pollUntil(submitted.runId, "assignment", (s) => s.phase !== "submitted", "the VRF draw", 5 * 60_000);
      await refreshScript(submitted.runId);

      const sealed = await call({ step: "witness", runId: submitted.runId });
      setRun(sealed);
      await refreshScript(sealed.runId);

      // Nothing here produces a verdict. The tribunal is the confidential
      // workflow, and this watches for what it writes.
      await pollUntil(sealed.runId, "verdict", (s) => Boolean(s.verdict), "the tribunal", 6 * 60_000);

      const settled = await call({ step: "finalize", runId: sealed.runId });
      setRun(settled);
      // One last read after settlement, because standing is written here and the
      // final beat is the one the whole page exists to show.
      await refreshScript(settled.runId);
    } catch (e) {
      if ((e as Error).message !== "cancelled") setError((e as Error).message);
    } finally {
      setBusy(false);
      setWaitingFor(null);
    }
  };

  const at = run ? phaseIndex(run.phase) : -1;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const settled = run?.phase === "settled";

  return (
    <>
      <div className="pick-group">
        <div className="pick-legend">
          <span className="pick-step">1</span>
          <div>
            <h2 className="pick-title">
              What should it claim?
              <a
                className="pick-partner"
                href="https://thegraph.com"
                target="_blank"
                rel="noreferrer"
                aria-label="The Graph"
                title="The Graph"
              >
                <PartnerMark id="graph" size={15} />
              </a>
            </h2>
            {/*
              The Graph's role, said where it actually happens. A subject is a
              pinned subgraph deployment, and the id under each card is a
              content hash of the mapping code — which is what makes two reads
              of it independent derivations rather than one source quoted twice.
            */}
            <p className="pick-help">
              Each card is a subgraph deployment pinned by content hash and served by the live Graph
              Gateway. Thirteen of them, two Messari schema families, five chains — and one query
              pattern reads all of them, so adding a protocol is a config line rather than code. Both
              agents will write their own GraphQL against the deployment you pick and read it at the
              same block. Where a subject has a second, independently written index, both are read and
              must agree or the claim comes back <span className="warn">Unverifiable</span>.
            </p>
          </div>
        </div>
        <div className="pick-grid">
          {subjects.map((s) => (
            <SubjectCard
              key={s.subject}
              s={s}
              selected={s.subject === subject}
              disabled={busy}
              onSelect={() => setSubject(s.subject)}
            />
          ))}
        </div>
      </div>

      <div className="pick-group">
        <div className="pick-legend">
          <span className="pick-step">2</span>
          <div>
            <h2 className="pick-title">
              Who is staking on it?
              <a
                className="pick-partner"
                href="https://ens.domains"
                target="_blank"
                rel="noreferrer"
                aria-label="ENS"
                title="ENS"
              >
                <PartnerMark id="ens" size={15} />
              </a>
            </h2>
            <p className="pick-help">
              Every agent owns a subname of <span className="mono">perjury.eth</span>, and its standing
              is a text record on that name that only the tribunal can write. Only agents the chain
              would actually accept are listed here: eligible on the roster, holding a key, and able to
              cover the bond.
            </p>
          </div>
        </div>
        <div className="pick-grid pick-grid-agents">
          {agents.map((a) => (
            <AgentCard
              key={a.label}
              a={a}
              selected={a.label === claimant}
              disabled={busy}
              onSelect={() => setClaimant(a.label)}
            />
          ))}
        </div>
      </div>

      <div className="submit-controls">
        {gated && (
          <label className="submit-field">
            <span className="submit-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="off"
              placeholder="shared with judges"
            />
          </label>
        )}

        <button
          type="button"
          className="submit-go"
          onClick={start}
          disabled={busy || !runnable || (gated && !password)}
        >
          {busy ? `Running · ${mmss}` : !runnable ? "Unavailable" : run ? "Submit another" : "Submit a claim"}
        </button>
      </div>

      {!run && !error && (
        <p className="submit-hint">
          This posts a real claim to Sepolia with a real bond, draws a real checker through Chainlink VRF, and
          settles for real. It takes about four minutes, most of it waiting. Nothing below is pre-recorded —
          it is the same view as the replay, except that here you are watching it happen.
        </p>
      )}

      {error && <p className="submit-error">{error}</p>}

      {/*
        The one thing a live page owes a viewer that a replay does not: which
        stage is in progress, and what it is waiting on. Four minutes of silence
        during a VRF round is indistinguishable from a page that has crashed.
      */}
      {run && (
        <div className="live-status" role="status" aria-live="polite">
          <span className="chip">
            claim {run.claimId ? `#${run.claimId}` : "pending"} · elapsed {mmss}
          </span>
          <ol className="live-phases">
            {PHASES.map((p, i) => (
              <li key={p.phase} data-state={at > i ? "done" : at === i ? "current" : "pending"}>
                {p.label}
              </li>
            ))}
          </ol>
          {waitingFor && <span className="live-waiting">waiting on {waitingFor}…</span>}
        </div>
      )}

      {/*
        The replay's own component, at the newest beat.

        `at` is the beat count rather than a cursor, because there is nothing to
        step through — the last beat is always the one that just happened. The
        lanes scroll to it as it arrives, which is the behaviour the replay
        already has during playback.
      */}
      {script && script.beats.length > 0 && (
        <Lanes script={script} at={script.beats.length} playing={busy} />
      )}

      {script?.standing && (
        <div style={{ marginTop: "2rem" }}>
          <Standing move={script.standing} moved={settled} />
        </div>
      )}

      {run && !script && (
        <p className="submit-hint">
          Drafting. Nothing is on chain until the bond is posted, so there is nothing to show yet — the
          agent commits to a sentence before it commits money, which is what stops the claim being
          adjusted later to match whatever the checker finds.
        </p>
      )}

      {settled && run?.claimId && (
        <p className="submit-done">
          Settled in {mmss}. <a href="/claims">See it in the claim feed</a>, or{" "}
          <a href={`/replay?claim=${run.claimId}`}>step back through it at your own pace</a>.
        </p>
      )}
    </>
  );
}
