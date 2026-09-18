/**
 * fix11y - Rule: aria-live-status (WCAG 2.1 AA 4.1.3 Status Messages)
 * Detects dynamic feedback, alert, toast, and search result containers lacking aria-live="polite".
 */

import { BaseRule } from './base.js';
import { findNodes, hasAttribute, getAttributeValue } from '../parser/parser.js';
import { createInsertAttributePatch } from '../parser/patcher.js';

const STATUS_CONTAINER_PATTERNS = [
  /search[-_]results?/i,
  /results?[-_]container/i,
  /status[-_]message/i,
  /live[-_]feedback/i,
  /notification[-_]toast/i,
  /toast[-_]container/i,
  /live[-_]region/i,
  /alert[-_]box/i,
  /error[-_]summary/i
];

export class AriaLiveStatusRule extends BaseRule {
  constructor() {
    super({
      id: 'aria-live-status',
      wcag: '4.1.3',
      description: 'Dynamic feedback, status, or search result regions must specify aria-live="polite".',
      plainLanguage: 'Dynamic content changes without page reloads must be announced to assistive tech using live regions.',
      scope: 'element',
      severity: 'warning',
      safety: 'safe'
    });
  }

  /**
   * Checks if an element's class, id, or data attributes match status region patterns.
   * @param {object} node
   * @returns {boolean}
   */
  isStatusRegion(node) {
    const cls = getAttributeValue(node, 'class') || '';
    const id = getAttributeValue(node, 'id') || '';
    const dataLive = getAttributeValue(node, 'data-live') || '';
    const target = `${cls} ${id} ${dataLive}`;

    return STATUS_CONTAINER_PATTERNS.some((pattern) => pattern.test(target));
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];

    const candidates = findNodes(cst, (n) => {
      if (n.type !== 'element') return false;
      return this.isStatusRegion(n) || getAttributeValue(n, 'role') === 'status';
    });

    for (const node of candidates) {
      if (!hasAttribute(node, 'aria-live')) {
        const cls = (getAttributeValue(node, 'class') || '').toLowerCase();
        const isAssertive = cls.includes('alert') || cls.includes('error');
        const liveType = isAssertive ? 'assertive' : 'polite';

        const patches = [
          createInsertAttributePatch(
            node,
            'aria-live',
            liveType,
            '"',
            `Add aria-live="${liveType}" to feedback container`
          )
        ];

        // Also add role="status" or role="alert" if not present
        if (!hasAttribute(node, 'role')) {
          const roleType = isAssertive ? 'alert' : 'status';
          patches.push(
            createInsertAttributePatch(
              node,
              'role',
              roleType,
              '"',
              `Add role="${roleType}" to feedback container`
            )
          );
        }

        diagnostics.push(
          this.createDiagnostic({
            message: `Status/feedback container <${node.tagName}> is missing aria-live="${liveType}".`,
            node,
            patches
          })
        );
      }
    }

    return diagnostics;
  }
}
