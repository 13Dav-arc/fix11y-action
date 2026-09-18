/**
 * fix11y - Rule: meta-viewport (WCAG 2.1/2.2 AA 1.4.4 Resize Text)
 * Ensures <meta name="viewport"> does not restrict pinch-to-zoom via user-scalable=no or maximum-scale < 2.
 * Surgically removes only the offending directive tokens while preserving all surrounding directives.
 */

import { BaseRule } from './base.js';
import { getElementsByTagName, hasAttribute, getAttributeValue } from '../parser/parser.js';
import { createUpdateAttributePatch, createInsertAttributePatch } from '../parser/patcher.js';

export class MetaViewportRule extends BaseRule {
  constructor() {
    super({
      id: 'meta-viewport',
      wcag: '1.4.4',
      description: '<meta name="viewport"> must not disable user zoom or set maximum-scale < 2.',
      plainLanguage: 'Disabling pinch-to-zoom (user-scalable=no or maximum-scale < 2) prevents low-vision users from magnifying content.',
      scope: 'element',
      severity: 'error',
      safety: 'safe'
    });
  }

  /**
   * Parses the content attribute into directive tokens and checks for scaling restrictions.
   * @param {string} content
   * @returns {{ hasViolation: boolean, cleanedContent: string, violations: string[] }}
   */
  sanitizeViewportContent(content) {
    const rawDirectives = content.split(',');
    const preservedDirectives = [];
    const violations = [];

    for (const raw of rawDirectives) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const [keyPart, valPart] = trimmed.split('=');
      const key = (keyPart || '').trim().toLowerCase();
      const val = (valPart || '').trim().toLowerCase();

      let isOffending = false;

      if (key === 'user-scalable' && (val === 'no' || val === '0')) {
        isOffending = true;
        violations.push('user-scalable=no');
      } else if (key === 'maximum-scale') {
        const num = parseFloat(val);
        if (!isNaN(num) && num < 2) {
          isOffending = true;
          violations.push(`maximum-scale=${val}`);
        }
      }

      if (!isOffending) {
        preservedDirectives.push(trimmed);
      }
    }

    // If all directives were removed, supply standard accessible default
    let cleanedContent = preservedDirectives.join(', ');
    if (!cleanedContent) {
      cleanedContent = 'width=device-width, initial-scale=1';
    }

    return {
      hasViolation: violations.length > 0,
      cleanedContent,
      violations
    };
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];
    const metaTags = getElementsByTagName(cst, 'meta');

    for (const meta of metaTags) {
      const nameVal = (getAttributeValue(meta, 'name') || '').trim().toLowerCase();
      if (nameVal !== 'viewport') continue;

      const contentVal = getAttributeValue(meta, 'content');
      if (!contentVal) {
        // Missing content attribute on viewport meta
        const patch = createInsertAttributePatch(
          meta,
          'content',
          'width=device-width, initial-scale=1',
          '"',
          'Add accessible content attribute to viewport meta'
        );

        diagnostics.push(
          this.createDiagnostic({
            message: '<meta name="viewport"> is missing a "content" attribute.',
            node: meta,
            patches: [patch]
          })
        );
        continue;
      }

      const { hasViolation, cleanedContent, violations } = this.sanitizeViewportContent(contentVal);

      if (hasViolation) {
        const patch = createUpdateAttributePatch(
          meta,
          'content',
          cleanedContent,
          null,
          `Surgically remove zoom restrictions (${violations.join(', ')}) from viewport meta`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: `<meta name="viewport"> restricts zooming via ${violations.join(', ')}.`,
            node: meta,
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
