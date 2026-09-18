/**
 * fix11y - Rule: tabindex-positive (WCAG 2.1/2.2 AA 2.4.3 Focus Order)
 * Detects positive tabindex attributes (> 0) that disrupt logical DOM tab navigation.
 */

import { BaseRule } from './base.js';
import { findNodes, hasAttribute, getAttributeValue } from '../parser/parser.js';
import { createUpdateAttributePatch } from '../parser/patcher.js';

export class TabindexPositiveRule extends BaseRule {
  constructor() {
    super({
      id: 'tabindex-positive',
      wcag: '2.4.3',
      description: 'Positive tabindex values (> 0) disrupt natural keyboard navigation and must be avoided.',
      plainLanguage: 'Positive tabindex numbers hijack keyboard tab order, creating disorienting jumps across the page.',
      scope: 'element',
      severity: 'error',
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
    const elementsWithTabindex = findNodes(cst, (n) => n.type === 'element' && hasAttribute(n, 'tabindex'));

    for (const el of elementsWithTabindex) {
      const rawVal = getAttributeValue(el, 'tabindex');
      const numVal = parseInt(rawVal, 10);

      if (!isNaN(numVal) && numVal > 0) {
        const patch = createUpdateAttributePatch(
          el,
          'tabindex',
          '0',
          null,
          `Change tabindex="${rawVal}" to tabindex="0" to preserve DOM order`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: `Positive tabindex="${rawVal}" detected on <${el.tagName}>. Use tabindex="0" or "-1" instead.`,
            node: el,
            safety: 'caution',
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
