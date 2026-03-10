/**
 * Diff result segment types
 */
export type DiffSegmentType = 'equal' | 'insert' | 'delete' | 'missing';

/**
 * A segment of the diff result
 */
export interface DiffSegment {
  type: DiffSegmentType;
  value: string;
}

/**
 * Diff options
 */
export interface DiffOptions {
  /** Ignore case differences (default: true) */
  ignoreCase?: boolean;
  /** Ignore leading/trailing whitespace (default: true) */
  ignoreWhitespace?: boolean;
}

/**
 * Compare two strings character by character and return diff segments.
 * Correct chars shown as 'equal', wrong chars as 'delete', missing chars as 'missing',
 * extra typed chars as 'insert'.
 *
 * @param typed - The user's typed answer
 * @param correct - The correct answer
 * @param options - Diff options
 * @returns Array of diff segments
 */
export function diffStrings(
  typed: string,
  correct: string,
  options: DiffOptions = {}
): DiffSegment[] {
  const { ignoreCase = true, ignoreWhitespace = true } = options;

  // Normalize strings based on options
  let normalizedTyped = typed;
  let normalizedCorrect = correct;

  if (ignoreWhitespace) {
    normalizedTyped = typed.trim();
    normalizedCorrect = correct.trim();
  }

  if (ignoreCase) {
    normalizedTyped = normalizedTyped.toLowerCase();
    normalizedCorrect = normalizedCorrect.toLowerCase();
  }

  const segments: DiffSegment[] = [];

  // Simple character-by-character diff using longest common subsequence approach
  const lcs = computeLCS(normalizedTyped, normalizedCorrect);

  let typedIndex = 0;
  let correctIndex = 0;
  let lcsIndex = 0;

  while (typedIndex < normalizedTyped.length || correctIndex < normalizedCorrect.length) {
    if (lcsIndex < lcs.length) {
      const expectedChar = lcs[lcsIndex];

      // Process typed characters before the matching character (extra/mistake)
      while (typedIndex < normalizedTyped.length && normalizedTyped[typedIndex] !== expectedChar) {
        segments.push({
          type: 'insert',
          value: typed[typedIndex],
        });
        typedIndex++;
      }

      // Process correct characters that weren't typed (missing)
      while (correctIndex < normalizedCorrect.length && normalizedCorrect[correctIndex] !== expectedChar) {
        segments.push({
          type: 'missing',
          value: correct[correctIndex],
        });
        correctIndex++;
      }

      // Add matching character
      if (typedIndex < normalizedTyped.length && correctIndex < normalizedCorrect.length) {
        segments.push({
          type: 'equal',
          value: correct[correctIndex], // Use original (not normalized) for display
        });
        typedIndex++;
        correctIndex++;
        lcsIndex++;
      }
    } else {
      // Process remaining typed characters (extra)
      while (typedIndex < normalizedTyped.length) {
        segments.push({
          type: 'insert',
          value: typed[typedIndex],
        });
        typedIndex++;
      }

      // Process remaining correct characters (missing)
      while (correctIndex < normalizedCorrect.length) {
        segments.push({
          type: 'missing',
          value: correct[correctIndex],
        });
        correctIndex++;
      }
    }
  }

  // If nothing was typed, return a single 'missing' segment for the entire correct answer
  if (segments.length === 0 && correct.length > 0) {
    return [{
      type: 'missing',
      value: correct,
    }];
  }

  // Merge adjacent segments of the same type for cleaner display
  return mergeSegments(segments);
}

/**
 * Compute Longest Common Subsequence
 */
function computeLCS(str1: string, str2: string): string[] {
  const m = str1.length;
  const n = str2.length;

  // Create DP table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      lcs.unshift(str1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Merge adjacent segments of the same type
 */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return segments;

  const merged: DiffSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].type === current.type) {
      current.value += segments[i].value;
    } else {
      merged.push(current);
      current = { ...segments[i] };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Calculate accuracy percentage
 */
export function calculateAccuracy(typed: string, correct: string): number {
  if (correct.length === 0) return typed.length === 0 ? 100 : 0;
  if (typed.length === 0) return 0;

  const segments = diffStrings(typed, correct);
  let correctChars = 0;

  for (const segment of segments) {
    if (segment.type === 'equal') {
      correctChars += segment.value.length;
    }
  }

  return Math.round((correctChars / correct.length) * 100);
}
