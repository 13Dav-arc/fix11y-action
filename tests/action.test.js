import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAction } from '../src/runner.js';
import { generatePrBody } from '../src/pr-template.js';

test('fix11y-action - handles zero violations cleanly with success Check Run', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix11y-act-zero-'));
  const checkCalls = [];
  const mockCheckManager = {
    createCheckRun: async () => 'mock-check-1',
    updateCheckRun: async (params) => checkCalls.push(params),
  };

  try {
    // Valid clean HTML
    fs.writeFileSync(
      path.join(tmpDir, 'clean.html'),
      '<!DOCTYPE html><html lang="en"><head><title>Clean</title></head><body><img src="logo.png" alt="Company Logo"><button type="button">Click</button></body></html>',
      'utf-8'
    );

    const result = await runAction({
      targetDir: tmpDir,
      checkManager: mockCheckManager,
      dryRun: true,
      skipTest: true,
    });

    assert.equal(result.status, 'success');
    assert.equal(result.appliedPatches.length, 0);
    assert.equal(checkCalls.length, 1);
    assert.equal(checkCalls[0].conclusion, 'success');
    assert.equal(checkCalls[0].title, 'fix11y: No accessibility violations found');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fix11y-action - applies safe and caution deterministic patches with scope: element', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix11y-act-patches-'));
  const checkCalls = [];
  const mockCheckManager = {
    createCheckRun: async () => 'mock-check-2',
    updateCheckRun: async (params) => checkCalls.push(params),
  };

  try {
    // Template with safe (img-alt) and caution (button-semantics) violations
    const html = `<div>
  <img src="divider.png">
  <div onclick="handleClick()">Submit</div>
</div>`;

    fs.writeFileSync(path.join(tmpDir, 'index.html'), html, 'utf-8');

    const result = await runAction({
      targetDir: tmpDir,
      geminiApiKey: '', // deterministic fallback
      checkManager: mockCheckManager,
      dryRun: true,
      skipTest: true,
    });

    assert.equal(result.status, 'success');
    assert.ok(result.appliedPatches.length >= 2, 'Applied safe and caution patches');

    const patched = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf-8');
    assert.match(patched, /alt=""/, 'Applied img-alt patch');
    assert.match(patched, /<button/i, 'Applied button-semantics patch');

    assert.equal(checkCalls.length, 1);
    assert.equal(checkCalls[0].conclusion, 'success');
    assert.match(checkCalls[0].title, /Accessibility remediations verified/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fix11y-action - generates accessible PR body with AI fallback callout', () => {
  const prBody = generatePrBody({
    commitSha: '9876543210abcdef',
    appliedPatches: [
      {
        file: 'views/header.html',
        ruleId: 'img-alt',
        wcag: '1.1.1',
        safety: 'safe',
        message: 'Injected decorative alt attribute',
        line: 3,
      },
    ],
    unresolvedAiIssues: [
      {
        file: 'views/graph.html',
        ruleId: 'complex-chart-alt',
        wcag: '1.1.1',
        message: 'Complex dynamic chart requires AI summarization',
        line: 14,
      },
    ],
    diffSummary: '+ <img src="logo.png" alt="">',
    testSummary: 'All 8 tests passed',
  });

  assert.match(prBody, /Remediation Overview/);
  assert.match(prBody, /🟢 `safe`/);
  assert.match(prBody, /AI-Assisted Remediation Notice/);
  assert.match(prBody, /The following violation\(s\) were detected but require AI assistance/);
  assert.match(prBody, /They were not auto-patched because `GEMINI_API_KEY` was not configured/);
  assert.match(prBody, /complex-chart-alt/);
});
