export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

/**
 * Computes a line-by-line diff between oldText and newText, similar to `git diff`.
 * Uses a Longest Common Subsequence (LCS) dynamic programming algorithm.
 */
export function computeLineDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to assemble diff lines
  let i = m;
  let j = n;
  const resultReversed: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      resultReversed.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      resultReversed.push({
        type: 'added',
        content: newLines[j - 1],
        newLineNumber: j,
      });
      additions++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      resultReversed.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNumber: i,
      });
      deletions++;
      i--;
    }
  }

  return {
    lines: resultReversed.reverse(),
    additions,
    deletions,
  };
}
