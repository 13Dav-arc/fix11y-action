/**
 * fix11y - Rule: heading-order (WCAG 2.1/2.2 AA 1.3.1 Info and Relationships, 2.4.6 Headings and Labels)
 * Detects skipped heading levels in a full document (e.g. <h1> followed directly by <h3>).
 * Scoped to 'document' — runs in Studio Playground on full documents, never on template fragments.
 */

import { BaseRule } from './base.js';
import { findNodes } from '../parser/parser.js';
import { createSwapTagNamePatch } from '../parser/patcher.js';

const HEADING_MAP = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6
};

export class HeadingOrderRule extends BaseRule {
  constructor() {
    super({
      id: 'heading-order',
      wcag: ['1.3.1', '2.4.6'],
      description: 'Heading levels should increase sequentially without skipping levels (e.g. <h1> to <h3>).',
      plainLanguage: 'Skipping heading levels (like jumping from <h1> to <h3>) creates a broken hierarchy in screen reader outline tools.',
      scope: 'document',
      severity: 'warning',
      safety: 'caution'
    });
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];
    const headings = findNodes(cst, (n) => n.type === 'element' && HEADING_MAP[n.tagName]);

    let prevLevel = 0;

    for (const heading of headings) {
      const currentLevel = HEADING_MAP[heading.tagName];

      if (prevLevel > 0 && currentLevel > prevLevel + 1) {
        const expectedTag = `h${prevLevel + 1}`;
        const patches = createSwapTagNamePatch(
          heading,
          expectedTag,
          `Adjust <${heading.tagName}> to sequential <${expectedTag}> (review hierarchy)`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: `Heading level skipped: <${heading.tagName}> follows <h${prevLevel}> without intermediate <${expectedTag}>.`,
            node: heading,
            safety: 'caution',
            patches
          })
        );
      }

      prevLevel = currentLevel;
    }

    return diagnostics;
  }
}
