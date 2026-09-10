/**
 * Token-level diff, for showing what two agents asked differently.
 *
 * A line diff is useless here: the composed documents are a single line each, so
 * every line differs and the reader learns nothing. What actually differs on a
 * real pair is a handful of tokens — on claim 24 it is the two `(block: {number:
 * N})` arguments the guard injects into the witness's read, which is precisely
 * the fact worth pointing at: the witness replays against the block the claimant
 * read rather than against whatever is latest.
 *
 * Standard LCS over tokens. The documents are a couple of dozen tokens, so the
 * quadratic table costs nothing and the alternative — a heuristic that is right
 * most of the time — would occasionally mark the wrong span on a page whose
 * whole argument is that it shows what happened.
 */

export interface DiffToken {
  text: string;
  /** True when this token has no counterpart in the other document. */
  changed: boolean;
}

/** Split into words while keeping the whitespace, so the document renders intact. */
function tokenize(doc: string): string[] {
  return doc.split(/(\s+)/).filter((t) => t !== "");
}

const isGap = (t: string) => /^\s+$/.test(t);

/**
 * Mark the tokens of each document that the other does not contain.
 *
 * Whitespace is carried through untouched — it is never "changed", because
 * highlighting a space communicates nothing and makes the marked spans look
 * ragged.
 */
export function diffTokens(a: string, b: string): { left: DiffToken[]; right: DiffToken[] } {
  const A = tokenize(a);
  const B = tokenize(b);

  // Longest common subsequence lengths.
  const n = A.length;
  const m = B.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = A[i] === B[j] ? (table[i + 1]![j + 1] ?? 0) + 1 : Math.max(table[i + 1]![j] ?? 0, table[i]![j + 1] ?? 0);
    }
  }

  const left: DiffToken[] = [];
  const right: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      left.push({ text: A[i]!, changed: false });
      right.push({ text: B[j]!, changed: false });
      i++;
      j++;
    } else if ((table[i + 1]![j] ?? 0) >= (table[i]![j + 1] ?? 0)) {
      left.push({ text: A[i]!, changed: !isGap(A[i]!) });
      i++;
    } else {
      right.push({ text: B[j]!, changed: !isGap(B[j]!) });
      j++;
    }
  }
  while (i < n) left.push({ text: A[i]!, changed: !isGap(A[i++]!) });
  while (j < m) right.push({ text: B[j]!, changed: !isGap(B[j++]!) });

  return { left, right };
}

/** How many tokens actually differ, for a one-line summary above the diff. */
export function changedCount(tokens: DiffToken[]): number {
  return tokens.filter((t) => t.changed).length;
}
