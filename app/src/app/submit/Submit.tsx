"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * The beats, in the order they happen.
 *
 * Listed up front rather than appended as they occur, so a reader can see where
 * the claim is going before it gets there. Four minutes of a progress bar with
 * no destination is indistinguishable from four minutes of nothing.
 */
const BEATS = [
  { phase: "drafted", title: "The claimant reads the indexer and drafts a claim" },
  { phase: "submitted", title: "It stakes ETH on that exact sentence" },
  { phase: "assigned", title: "Chainlink VRF picks who checks it" },
  { phase: "sealed", title: "The checker derives its own answer, and both are sealed" },
  { phase: "adjudicated", title: "The tribunal reads them inside the enclave" },
  { phase: "settled", title: "Settlement, and the record follows the name" },
] as const;

const EXPLORER = "https://sepolia.etherscan.io/tx";
const phaseIndex = (p: string) => BEATS.findIndex((b) => b.phase === p);

export default function Submit({ subjects, agents }: { subjects: SubjectOption[]; agents: string[] }) {
  const [subject, setSubject] = useState(subjects[0]?.subject ?? "aave-v3-ethereum");
  const [claimant, setClaimant] = useState(agents[0] ?? "operator");
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  // True elapsed time. A claim that took six minutes says six minutes.
  useEffect(() => {
    if (!busy || !run) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - run.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy, run]);

  const call = useCallback(async (body: Record<string, unknown>): Promise<RunState> => {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `step failed (${res.status})`);
    return json as RunState;
  }, []);

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
    setElapsed(0);
    setBusy(true);
    try {
      const drafted = await call({ step: "draft", subject, claimant });
      setRun(drafted);

      const submitted = await call({ step: "submit", runId: drafted.runId });
      setRun(submitted);

      await pollUntil(submitted.runId, "assignment", (s) => s.phase !== "submitted", "the VRF draw", 5 * 60_000);

      const sealed = await call({ step: "witness", runId: submitted.runId });
      setRun(sealed);

      // Nothing here produces a verdict. The tribunal is the confidential
      // workflow, and this watches for what it writes.
      await pollUntil(sealed.runId, "verdict", (s) => Boolean(s.verdict), "the tribunal", 6 * 60_000);

      const settled = await call({ step: "finalize", runId: sealed.runId });
      setRun(settled);
    } catch (e) {
      if ((e as Error).message !== "cancelled") setError((e as Error).message);
    } finally {
      setBusy(false);
      setWaitingFor(null);
    }
  };

  const at = run ? phaseIndex(run.phase) : -1;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

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

        <button type="button" className="submit-go" onClick={start} disabled={busy}>
          {busy ? `Running · ${mmss}` : "Submit a claim"}
        </button>
      </div>

      {!run && !error && (
        <p className="submit-hint">
          This posts a real claim to Sepolia with a real bond, draws a real checker through Chainlink VRF, and
          settles for real. It takes about four minutes, most of it waiting. Nothing below is pre-recorded.
        </p>
      )}

      {error && <p className="submit-error">{error}</p>}

      <ol className="submit-steps">
        {BEATS.map((b, i) => {
          const state = at > i ? "done" : at === i ? "current" : "pending";
          return (
            <li key={b.phase} data-state={state}>
              <h3><span className="submit-step-n">{i + 1}</span>{b.title}</h3>
              <div className="submit-step-body">
                {i === 0 && run && (
                  <>
                    <p>{run.text}</p>
                    <p className="submit-mono">claimHash {run.claimHash}</p>
                    {run.claimedValue !== null && <p><strong>{run.claimedValue}%</strong> — what it is staking on</p>}
                  </>
                )}
                {i === 1 && run?.submitTx && (
                  <>
                    <p>Claim #{run.claimId}, bonded 0.010 ETH plus a 0.002 witness fee.</p>
                    <p className="submit-mono"><a href={`${EXPLORER}/${run.submitTx}`} target="_blank" rel="noreferrer">{run.submitTx}</a></p>
                  </>
                )}
                {i === 2 && run?.witnessAgent?.address && (
                  <p className="submit-mono">
                    drawn {run.witnessAgent.address} — not chosen by the claimant, and not predictable by it
                  </p>
                )}
                {i === 3 && run?.gatewayUrl && (
                  <>
                    {run.witnessValue !== null && run.witnessValue !== undefined && (
                      <p><strong>{run.witnessValue}%</strong> — derived independently, from the same block</p>
                    )}
                    <p>
                      Both submissions are now ciphertext. The key that opens them is released by Chainlink&apos;s
                      Vault DON into an attested enclave and nowhere else.
                    </p>
                    <p className="submit-mono">
                      <a href={run.gatewayUrl} target="_blank" rel="noreferrer">the sealed bundle, fetchable by anyone</a>
                    </p>
                  </>
                )}
                {i === 4 && (run?.verdict
                  ? <p><strong>{run.verdict}</strong> — a verdict and a commitment hash. No evidence, no method, neither value.</p>
                  : at === 4 && <p>Waiting for the confidential workflow. It finds the claim on chain itself.</p>)}
                {i === 5 && run?.finalizeTx && (
                  <p className="submit-mono"><a href={`${EXPLORER}/${run.finalizeTx}`} target="_blank" rel="noreferrer">{run.finalizeTx}</a></p>
                )}
                {state === "current" && waitingFor && <p className="submit-waiting">waiting on {waitingFor}…</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {run?.phase === "settled" && (
        <p className="submit-done">
          Settled. <a href="/claims">See it in the claim feed</a>, or{" "}
          <a href={`/replay?claim=${run.claimId}`}>replay it from its own transactions</a>.
        </p>
      )}
    </>
  );
}
