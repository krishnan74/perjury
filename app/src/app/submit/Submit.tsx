"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReplayScript } from "@/lib/replay";
import Lanes from "../replay/Lanes";
import Standing from "../replay/Standing";

export interface SubjectOption {
  subject: string;
  chain: string;
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

export default function Submit({
  subjects,
  agents,
  gated,
}: {
  subjects: SubjectOption[];
  agents: string[];
  /** Whether this deployment requires the shared password to spend anything. */
  gated: boolean;
}) {
  const [subject, setSubject] = useState(subjects[0]?.subject ?? "aave-v3-ethereum");
  const [claimant, setClaimant] = useState(agents[0] ?? "operator");
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
      <div className="submit-controls">
        <label className="submit-field">
          <span className="submit-label">Subject</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy}>
            {subjects.map((s) => (
              <option key={s.subject} value={s.subject}>{s.subject} · {s.chain}</option>
            ))}
          </select>
        </label>

        <label className="submit-field">
          <span className="submit-label">Claimant</span>
          <select value={claimant} onChange={(e) => setClaimant(e.target.value)} disabled={busy}>
            {agents.map((a) => <option key={a} value={a}>{a}.perjury.eth</option>)}
          </select>
        </label>

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

        <button type="button" className="submit-go" onClick={start} disabled={busy || (gated && !password)}>
          {busy ? `Running · ${mmss}` : run ? "Submit another" : "Submit a claim"}
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
