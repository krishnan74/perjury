"use client";

import { useEffect, useRef, useState } from "react";

export interface SubjectOption {
  subject: string;
  chain: string;
}

type Phase = "idle" | "running" | "done" | "failed";

/**
 * A step, as the runner announces it.
 *
 * The runner prints a numbered heading for each stage and indented detail
 * underneath. Parsing that back into structure is deliberate: the alternative is
 * a second format maintained alongside the terminal one, and the two would
 * disagree the first time either changed.
 */
interface Step {
  n: number;
  title: string;
  lines: string[];
}

const STEP = /^▸\s*(\d+)\.\s*(.+)$/;
const TX = /(0x[0-9a-fA-F]{8,})/;

export default function Submit({ subjects, agents }: { subjects: SubjectOption[]; agents: string[] }) {
  const [subject, setSubject] = useState(subjects[0]?.subject ?? "aave-v3-ethereum");
  const [claimant, setClaimant] = useState(agents[0] ?? "operator");
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [tail, setTail] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const source = useRef<EventSource | null>(null);
  const startedAt = useRef(0);
  const bottom = useRef<HTMLDivElement | null>(null);

  // True elapsed time, never a simulated clock. A claim that took six minutes
  // should say six minutes even if nothing visible happened for four of them.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => source.current?.close(), []);

  useEffect(() => {
    if (phase === "running") bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [phase]);

  const start = () => {
    setSteps([]);
    setTail([]);
    setError(null);
    setElapsed(0);
    startedAt.current = Date.now();
    setPhase("running");

    const es = new EventSource(
      `/api/run?subject=${encodeURIComponent(subject)}&claimant=${encodeURIComponent(claimant)}`,
    );
    source.current = es;

    es.addEventListener("line", (e) => {
      const { line } = JSON.parse((e as MessageEvent).data) as { line: string };
      const heading = line.trim().match(STEP);
      if (heading) {
        setSteps((s) => [...s, { n: Number(heading[1]), title: heading[2], lines: [] }]);
      } else {
        setSteps((s) => {
          if (s.length === 0) return s;
          const last = s[s.length - 1];
          return [...s.slice(0, -1), { ...last, lines: [...last.lines, line] }];
        });
      }
      setTail((t) => [...t.slice(-200), line]);
    });

    es.addEventListener("done", (e) => {
      const { code } = JSON.parse((e as MessageEvent).data) as { code: number };
      setPhase(code === 0 ? "done" : "failed");
      if (code !== 0) setError("The runner exited without settling the claim. The log below is everything it said.");
      es.close();
    });

    es.onerror = () => {
      setPhase((p) => (p === "running" ? "failed" : p));
      setError((prev) => prev ?? "The stream dropped. The run may still be finishing on the server.");
      es.close();
    };
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="submit-controls">
        <label className="submit-field">
          <span className="submit-label">Subject</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={phase === "running"}>
            {subjects.map((s) => (
              <option key={s.subject} value={s.subject}>
                {s.subject} · {s.chain}
              </option>
            ))}
          </select>
        </label>

        <label className="submit-field">
          <span className="submit-label">Claimant</span>
          <select value={claimant} onChange={(e) => setClaimant(e.target.value)} disabled={phase === "running"}>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}.perjury.eth
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="submit-go" onClick={start} disabled={phase === "running"}>
          {phase === "running" ? `Running · ${mmss}` : "Submit a claim"}
        </button>
      </div>

      {phase === "idle" && (
        <p className="submit-hint">
          This posts a real claim to Sepolia with a real bond, draws a real witness through Chainlink VRF, and
          settles for real. It takes about four minutes, most of it waiting. Nothing below is pre-recorded.
        </p>
      )}

      {error && <p className="submit-error">{error}</p>}

      {steps.length > 0 && (
        <ol className="submit-steps">
          {steps.map((s) => (
            <li key={`${s.n}-${s.title}`}>
              <h3>
                <span className="submit-step-n">{s.n}</span>
                {s.title}
              </h3>
              <div className="submit-step-body">
                {s.lines.map((l, i) => {
                  const tx = l.match(TX);
                  return (
                    <p key={`${s.n}-${i}-${l.slice(0, 12)}`} className={tx ? "submit-mono" : undefined}>
                      {l}
                    </p>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}

      {phase === "done" && (
        <p className="submit-done">
          Settled. <a href="/claims">See it in the claim feed</a>, or{" "}
          <a href="/replay">replay it from its own transactions</a>.
        </p>
      )}

      {tail.length > 0 && (
        <details className="submit-raw">
          <summary>Everything the runner printed ({tail.length} lines)</summary>
          <pre>{tail.join("\n")}</pre>
        </details>
      )}

      <div ref={bottom} />
    </>
  );
}
