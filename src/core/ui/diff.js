/**
 * fix11y - Pure Zero-Dependency Myers Diff Engine & ANSI Unified Diff Formatter.
 */

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Computes shortest edit script between two line arrays using Myers Diff algorithm.
 * @param {string[]} aLines - Original lines
 * @param {string[]} bLines - Modified lines
 * @returns {Array<{ type: 'eq'|'add'|'del', value: string }>}
 */
export function myersDiff(aLines, bLines) {
  const N = aLines.length;
  const M = bLines.length;
  const max = N + M;

  if (max === 0) return [];

  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace = [];

  let found = false;
  let finalD = 0;

  for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v));

    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset]; // move down (insertion)
      } else {
        x = v[k - 1 + offset] + 1; // move right (deletion)
      }

      let y = x - k;

      while (x < N && y < M && aLines[x] === bLines[y]) {
        x++;
        y++;
      }

      v[k + offset] = x;

      if (x >= N && y >= M) {
        found = true;
        finalD = d;
        break;
      }
    }

    if (found) break;
  }

  // Backtrack to build edit script
  const edits = [];
  let x = N;
  let y = M;

  for (let d = finalD; d > 0; d--) {
    const k = x - y;
    const vPrev = trace[d];
    const prevK = (k === -d || (k !== d && vPrev[k - 1 + offset] < vPrev[k + 1 + offset]))
      ? k + 1
      : k - 1;

    const prevX = vPrev[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ type: 'eq', value: aLines[x] });
    }

    if (x === prevX) {
      y--;
      edits.push({ type: 'add', value: bLines[y] });
    } else if (y === prevY) {
      x--;
      edits.push({ type: 'del', value: aLines[x] });
    }
  }

  while (x > 0 && y > 0) {
    x--;
    y--;
    edits.push({ type: 'eq', value: aLines[x] });
  }

  edits.reverse();
  return edits;
}

/**
 * Splits text into lines normalized across LF and CRLF.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (!text) return [];
  return text.split(/\r?\n/);
}

/**
 * Generates unified diff hunks from edit operations.
 * @param {Array<{ type: 'eq'|'add'|'del', value: string }>} edits
 * @param {number} [context=3]
 * @returns {Array<object>} Hunk objects
 */
export function buildHunks(edits, context = 3) {
  const hasChanges = edits.some((e) => e.type !== 'eq');
  if (!hasChanges) return [];

  // Group edits into change clusters
  const clusters = [];
  let currentCluster = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (edit.type !== 'eq') {
      const start = Math.max(0, i - context);
      const end = Math.min(edits.length - 1, i + context);
      currentCluster.push({ start, end, changeIdx: i });
    }
  }

  if (currentCluster.length === 0) return [];

  // Merge overlapping or adjacent clusters
  const merged = [];
  let cur = { start: currentCluster[0].start, end: currentCluster[0].end };

  for (let i = 1; i < currentCluster.length; i++) {
    const next = currentCluster[i];
    if (next.start <= cur.end + 1) {
      cur.end = Math.max(cur.end, next.end);
    } else {
      merged.push(cur);
      cur = { start: next.start, end: next.end };
    }
  }
  merged.push(cur);

  // Compute line numbers and construct hunks
  let aLine = 1;
  let bLine = 1;
  let editIdx = 0;

  const hunks = [];

  for (const range of merged) {
    // Advance line counters to start of range
    while (editIdx < range.start) {
      const e = edits[editIdx];
      if (e.type === 'eq' || e.type === 'del') aLine++;
      if (e.type === 'eq' || e.type === 'add') bLine++;
      editIdx++;
    }

    const hunkEdits = edits.slice(range.start, range.end + 1);
    const aStart = aLine;
    const bStart = bLine;
    let aCount = 0;
    let bCount = 0;

    for (const e of hunkEdits) {
      if (e.type === 'eq' || e.type === 'del') {
        aCount++;
        aLine++;
      }
      if (e.type === 'eq' || e.type === 'add') {
        bCount++;
        bLine++;
      }
      editIdx++;
    }

    hunks.push({
      aStart,
      aCount,
      bStart,
      bCount,
      lines: hunkEdits
    });
  }

  return hunks;
}

/**
 * Creates a formatted Unified Diff string with optional ANSI coloring.
 * @param {string} oldStr
 * @param {string} newStr
 * @param {object} [options={}]
 * @param {string} [options.fromFile='original']
 * @param {string} [options.toFile='remediated']
 * @param {number} [options.context=3]
 * @param {boolean} [options.color=true]
 * @returns {string} Formatted unified diff string
 */
export function createUnifiedDiff(oldStr, newStr, options = {}) {
  const {
    fromFile = 'a/file',
    toFile = 'b/file',
    context = 3,
    color = true
  } = options;

  if (oldStr === newStr) return '';

  const aLines = splitLines(oldStr);
  const bLines = splitLines(newStr);

  const edits = myersDiff(aLines, bLines);
  const hunks = buildHunks(edits, context);

  if (hunks.length === 0) return '';

  const c = color ? ANSI : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', cyan: '', gray: '' };
  const out = [];

  out.push(`${c.bold}${c.red}--- ${fromFile}${c.reset}`);
  out.push(`${c.bold}${c.green}+++ ${toFile}${c.reset}`);

  for (const hunk of hunks) {
    out.push(
      `${c.cyan}@@ -${hunk.aStart},${hunk.aCount} +${hunk.bStart},${hunk.bCount} @@${c.reset}`
    );

    for (const line of hunk.lines) {
      if (line.type === 'add') {
        out.push(`${c.green}+ ${line.value}${c.reset}`);
      } else if (line.type === 'del') {
        out.push(`${c.red}- ${line.value}${c.reset}`);
      } else {
        out.push(`${c.gray}  ${line.value}${c.reset}`);
      }
    }
  }

  return out.join('\n');
}
