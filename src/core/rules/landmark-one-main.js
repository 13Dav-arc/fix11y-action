/**
 * fix11y - Rule: landmark-one-main (WCAG 2.1/2.2 AA 1.3.1 Info and Relationships, 2.4.1 Bypass Blocks)
 * Ensures a document contains exactly one <main> landmark.
 * Scoped to 'document' — runs in Studio Playground on full documents, never on template fragments.
 */

import { BaseRule } from './base.js';
import { findNodes, getAttributeValue } from '../parser/parser.js';

export class LandmarkOneMainRule extends BaseRule {
  constructor() {
    super({
      id: 'landmark-one-main',
      wcag: ['1.3.1', '2.4.1'],
      description: 'A document should contain exactly one <main> landmark.',
      plainLanguage: 'Screen readers provide a single-key shortcut to jump directly to the <main> content landmark.',
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

    const mainLandmarks = findNodes(cst, (n) => {
      if (n.type !== 'element') return false;
      if (n.tagName === 'main') return true;
      const role = (getAttributeValue(n, 'role') || '').trim().toLowerCase();
      return role === 'main';
    });

    const bodyElement = findNodes(cst, (n) => n.type === 'element' && n.tagName === 'body')[0];

    // Case 1: Multiple <main> landmarks
    if (mainLandmarks.length > 1) {
      for (let i = 1; i < mainLandmarks.length; i++) {
        const extraMain = mainLandmarks[i];
        diagnostics.push(
          this.createDiagnostic({
            message: `Multiple <main> landmarks detected (${mainLandmarks.length} found). A page must have only one primary content landmark.`,
            node: extraMain,
            safety: 'caution',
            patches: []
          })
        );
      }
    } else if (mainLandmarks.length === 0 && bodyElement) {
      // Case 2: Complete document with <body> but 0 <main> landmarks
      diagnostics.push(
        this.createDiagnostic({
          message: 'Document lacks a <main> landmark for screen reader shortcut navigation.',
          node: bodyElement,
          safety: 'caution',
          patches: []
        })
      );
    }

    return diagnostics;
  }
}
