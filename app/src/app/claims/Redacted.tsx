/**
 * A value that never left the enclave.
 *
 * Renders an empty block, not concealed text. The width is arbitrary — it exists
 * so the bar looks like a redaction rather than a rule, and it must never encode
 * the length of the real value, which would leak information about it.
 */
export function Redacted({ ch, label }: { ch: number; label: string }) {
  return (
    <span
      className="redacted"
      style={{ ["--w" as string]: `${ch}ch` }}
      role="img"
      aria-label={`${label} — withheld, never published on chain`}
    />
  );
}
