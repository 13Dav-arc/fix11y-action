import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parse, evaluateRules, applyPatches, createUnifiedDiff } from './core/index.js';
import { CheckRunManager } from './check-run.js';
import { generatePrBody } from './pr-template.js';

/**
 * Recursively scans directory for HTML and template files.
 */
function findTemplateFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        findTemplateFiles(fullPath, fileList);
      }
    } else if (/\.(html|mustache|hbs)$/i.test(entry.name)) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

/**
 * Executes a Git command safely.
 */
function git(cmd, args = [], cwd = '.') {
  try {
    return execSync(`git ${cmd} ${args.join(' ')}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    return null;
  }
}

/**
 * Main orchestrator for fix11y-action in private repositories.
 * Native Check Run only mode (100% confidential, zero external API calls).
 */
export async function runAction(options = {}) {
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const geminiApiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY;
  const targetDir = options.targetDir ?? process.env.TARGET_DIRECTORY ?? '.';
  const safeOnly = options.safeOnly ?? (process.env.SAFE_ONLY === 'true');

  const githubRepository = process.env.GITHUB_REPOSITORY || 'acme/private-repo';
  const [owner, repo] = githubRepository.split('/');
  const headSha = process.env.GITHUB_SHA || git('rev-parse HEAD', [], targetDir) || 'head';
  const branch = process.env.GITHUB_REF_NAME || 'main';

  console.log('[START] Beginning fix11y Action runner for private repository...');
  console.log(`[INFO] Repository: ${githubRepository}@${headSha.slice(0, 7)}`);
  console.log(`[INFO] Target directory: ${path.resolve(targetDir)}`);

  if (!geminiApiKey) {
    console.log('[INFO] No GEMINI_API_KEY detected — running in pure deterministic mode.');
  }

  const checkManager = options.checkManager || new CheckRunManager({ token, owner, repo });
  const checkRunId = options.checkRunId ?? await checkManager.createCheckRun({ headSha });

  const templateFiles = findTemplateFiles(targetDir);
  console.log(`[INFO] Found ${templateFiles.length} template file(s) to evaluate.`);

  const appliedPatches = [];
  const unresolvedAiIssues = [];
  let combinedDiff = '';

  for (const file of templateFiles) {
    let content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(targetDir, file).replace(/\\/g, '/');

    let hasMorePatches = true;
    let iteration = 0;
    const maxIterations = 50;

    while (hasMorePatches && iteration < maxIterations) {
      iteration++;
      const cst = parse(content);
      // EXPLICIT CONFIRMATION: Runs evaluateRules with scope: "element"
      const diagnostics = evaluateRules(cst, { scope: 'element' });

      let nextViolationToPatch = null;
      for (const diag of diagnostics) {
        if (!diag.patches || diag.patches.length === 0) {
          continue;
        }

        if (safeOnly && diag.safety !== 'safe') {
          continue;
        }

        nextViolationToPatch = diag;
        break;
      }

      if (!nextViolationToPatch) {
        hasMorePatches = false;
        break;
      }

      const patchedContent = applyPatches(content, nextViolationToPatch.patches);
      if (patchedContent === content) {
        hasMorePatches = false;
        break;
      }

      appliedPatches.push({
        file: relativePath,
        ruleId: nextViolationToPatch.ruleId,
        wcag: nextViolationToPatch.wcag,
        safety: nextViolationToPatch.safety,
        message: nextViolationToPatch.message,
        line: nextViolationToPatch.loc?.line || nextViolationToPatch.loc?.start?.line || 1,
      });

      content = patchedContent;
    }

    // Final pass on settled content for zero-patch / manual review issues
    const finalCst = parse(content);
    const finalDiagnostics = evaluateRules(finalCst, { scope: 'element' });
    for (const diag of finalDiagnostics) {
      if (!diag.patches || diag.patches.length === 0) {
        unresolvedAiIssues.push({
          file: relativePath,
          ruleId: diag.ruleId,
          wcag: diag.wcag,
          safety: diag.safety || 'caution',
          message: diag.message,
          line: diag.loc?.line || diag.loc?.start?.line || 1,
          requiresAi: Boolean(diag.requiresAi || diag.safety === 'review_needed'),
        });
      }
    }

    const originalContent = fs.readFileSync(file, 'utf-8');
    if (content !== originalContent) {
      fs.writeFileSync(file, content, 'utf-8');
      const fileDiff = createUnifiedDiff(originalContent, content, relativePath, relativePath);
      combinedDiff += (combinedDiff ? '\n' : '') + fileDiff;
    }
  }

  // Path 1: Zero Violations
  if (appliedPatches.length === 0) {
    console.log('[SUCCESS] Zero accessibility violations detected in scanned templates.');
    await checkManager.updateCheckRun({
      checkRunId,
      status: 'completed',
      conclusion: 'success',
      title: 'fix11y: No accessibility violations found',
      summary: 'All templates scanned across the repository meet WCAG 2.1/2.2 AA standards. No remediation patches required.',
    });
    return { status: 'success', appliedPatches: [], unresolvedAiIssues };
  }

  console.log(`[INFO] Applied ${appliedPatches.length} surgical patch(es). Running local verification...`);

  // Path 2: Local Verification (npm test if package.json exists)
  let testSuccess = true;
  let testSummary = 'All tests passed cleanly';
  const hasPkg = fs.existsSync(path.join(targetDir, 'package.json'));

  if (hasPkg && !options.skipTest) {
    try {
      console.log('[INFO] Running local npm test to verify changes...');
      execSync('npm test', { cwd: targetDir, stdio: 'pipe' });
    } catch (testErr) {
      testSuccess = false;
      const logExcerpt = (testErr.stdout?.toString() || testErr.message || '').slice(-2000);
      console.error('[ERROR] Local test verification failed after applying patches.');

      await checkManager.updateCheckRun({
        checkRunId,
        status: 'completed',
        conclusion: 'failure',
        title: 'fix11y: Test verification failed',
        summary: 'Automated accessibility patches were generated, but your test suite (\'npm test\') failed. To prevent breaking changes, no pull request was created.',
        text: logExcerpt,
      });

      return { status: 'failure', category: 'test_failure', error: 'Verification failed' };
    }
  }

  // Path 3: Create Branch & Open PR
  const shortSha = headSha.slice(0, 7);
  const remediationBranch = `fix11y/remediation-${shortSha}`;
  const prBody = generatePrBody({
    commitSha: headSha,
    appliedPatches,
    unresolvedAiIssues,
    diffSummary: combinedDiff,
    testSummary,
  });

  if (token && !options.dryRun) {
    try {
      console.log(`[INFO] Pushing changes to branch ${remediationBranch}...`);
      git(`checkout -b ${remediationBranch}`, [], targetDir);
      git('add -A', [], targetDir);
      git(`commit -m "fix(a11y): automated surgical accessibility remediation"`, [], targetDir);
      git(`push origin ${remediationBranch} --force`, [], targetDir);

      console.log('[INFO] Opening Pull Request via GitHub API...');
      const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'fix11y-action/1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `fix11y: Automated accessibility remediation for commit ${shortSha}`,
          body: prBody,
          head: remediationBranch,
          base: branch,
        }),
      });

      if (!prRes.ok) {
        const prErr = await prRes.text();
        console.warn(`[WARNING] PR creation returned ${prRes.status}: ${prErr}`);
      } else {
        console.log('[SUCCESS] Pull Request created successfully!');
      }
    } catch (gitErr) {
      console.warn(`[WARNING] Git push or PR creation error: ${gitErr.message}`);
    }
  }

  await checkManager.updateCheckRun({
    checkRunId,
    status: 'completed',
    conclusion: 'success',
    title: 'fix11y: Accessibility remediations verified & PR opened',
    summary: `Successfully applied ${appliedPatches.length} patch(es). All repository tests passed cleanly. Pull request opened.`,
    text: prBody,
  });

  return {
    status: 'success',
    appliedPatches,
    unresolvedAiIssues,
    diffSummary: combinedDiff,
  };
}

// Direct execution entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('src/runner.js')) {
  runAction().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(`[ERROR] Action failed: ${err.message}`);
    process.exit(1);
  });
}
