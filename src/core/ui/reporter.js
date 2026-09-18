/**
 * fix11y - Terminal & CI Reporter.
 * Zero external dependencies.
 */

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

/**
 * Checks if color output should be enabled.
 * @param {boolean} [explicit]
 * @returns {boolean}
 */
export function shouldUseColor(explicit) {
  if (explicit !== undefined) return Boolean(explicit);
  if (typeof process !== 'undefined') {
    if (process.env?.NO_COLOR) return false;
    return Boolean(process.stdout?.isTTY);
  }
  return false;
}

/**
 * Formats a list of file scan results into a structured JSON string.
 * @param {Array<{ file: string, diagnostics: Array<object>, patched?: string, original?: string }>} fileResults
 * @param {object} [extraSummary={}]
 * @returns {string}
 */
export function formatJsonReport(fileResults, extraSummary = {}) {
  let totalViolations = 0;
  let safeFixes = 0;
  let cautionFixes = 0;
  let cleanFiles = 0;
  let violatingFiles = 0;

  const files = fileResults.map((res) => {
    const count = res.diagnostics.length;
    if (count === 0) {
      cleanFiles++;
    } else {
      violatingFiles++;
    }

    totalViolations += count;

    const violations = res.diagnostics.map((d) => {
      if (d.safety === 'safe') safeFixes++;
      if (d.safety === 'caution') cautionFixes++;

      return {
        ruleId: d.ruleId,
        wcag: d.wcag,
        severity: d.severity,
        safety: d.safety,
        message: d.message,
        line: d.loc ? d.loc.line : 1,
        column: d.loc ? d.loc.column : 1
      };
    });

    return {
      file: res.file,
      violationsCount: count,
      violations
    };
  });

  const payload = {
    summary: {
      filesScanned: fileResults.length,
      cleanFiles,
      violatingFiles,
      totalViolations,
      safeFixes,
      cautionFixes,
      ...extraSummary
    },
    files
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Prints a human-readable terminal report of scan diagnostics and summary.
 * @param {Array<{ file: string, diagnostics: Array<object>, patchesApplied?: number }>} fileResults
 * @param {object} [options={}]
 * @param {boolean} [options.color]
 * @returns {string} Formatted terminal string
 */
export function formatTerminalReport(fileResults, options = {}) {
  const useColor = shouldUseColor(options.color);
  const c = useColor ? ANSI : {
    reset: '', bold: '', dim: '', underline: '', red: '',
    green: '', yellow: '', blue: '', magenta: '', cyan: '',
    gray: '', bgRed: '', bgGreen: ''
  };

  const lines = [];
  let totalViolations = 0;
  let safeCount = 0;
  let cautionCount = 0;
  let cleanCount = 0;

  lines.push('');
  lines.push(`${c.bold}${c.cyan}⚡ fix11y Accessibility Audit Report${c.reset}`);
  lines.push(`${c.gray}──────────────────────────────────────────────────${c.reset}`);

  for (const res of fileResults) {
    if (res.diagnostics.length === 0) {
      cleanCount++;
      continue;
    }

    totalViolations += res.diagnostics.length;
    lines.push(`\n${c.bold}${c.underline}${res.file}${c.reset}`);

    for (const d of res.diagnostics) {
      if (d.safety === 'safe') safeCount++;
      if (d.safety === 'caution') cautionCount++;

      const locStr = d.loc ? `${d.loc.line}:${d.loc.column}` : '1:1';
      const sevTag = d.severity === 'error' ? `${c.red}error${c.reset}` : `${c.yellow}warning${c.reset}`;
      const safetyTag = d.safety === 'safe' ? `${c.green}[safe]${c.reset}` : `${c.yellow}[caution]${c.reset}`;
      const wcagStr = Array.isArray(d.wcag) ? d.wcag.join(', ') : d.wcag;

      lines.push(
        `  ${c.dim}${locStr.padEnd(8)}${c.reset} ${sevTag}  ${safetyTag}  ${d.message}  ${c.gray}(${d.ruleId} WCAG ${wcagStr})${c.reset}`
      );
    }
  }

  // Summary box
  lines.push(`\n${c.gray}──────────────────────────────────────────────────${c.reset}`);
  if (totalViolations === 0) {
    lines.push(
      `${c.bold}${c.green}✔ All ${fileResults.length} file(s) are WCAG 2.1 AA compliant! No violations detected.${c.reset}\n`
    );
  } else {
    lines.push(
      `${c.bold}Summary:${c.reset} ${totalViolations} violation(s) across ${fileResults.length - cleanCount} of ${fileResults.length} files scanned.`
    );
    lines.push(
      `  • ${c.green}${safeCount} Safe Auto-Fixable${c.reset}  • ${c.yellow}${cautionCount} Review-Advised (Caution)${c.reset}`
    );
    lines.push('');
  }

  return lines.join('\n');
}
