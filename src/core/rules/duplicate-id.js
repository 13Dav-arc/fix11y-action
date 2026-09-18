/**
 * fix11y - Rule: duplicate-id (WCAG 2.1/2.2 AA 4.1.2 Name, Role, Value)
 * Detects duplicate id attributes on elements within the same document/file.
 */

import { BaseRule } from './base.js';
import { findNodes, hasAttribute, getAttributeValue } from '../parser/parser.js';

export class DuplicateIdRule extends BaseRule {
  constructor() {
    super({
      id: 'duplicate-id',
      wcag: '4.1.2',
      description: 'Element id attributes within a file must be unique.',
      plainLanguage: 'Duplicate id attributes cause screen readers and aria-labelledby/for references to bind to the wrong element. Automatic patching is withheld to prevent breaking CSS, JavaScript, or anchor references; resolve duplicate IDs manually.',
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
    const elementsWithId = findNodes(cst, (n) => n.type === 'element' && hasAttribute(n, 'id'));
    const idOccurrences = new Map();

    for (const el of elementsWithId) {
      const idVal = (getAttributeValue(el, 'id') || '').trim();
      if (!idVal) continue;

      if (!idOccurrences.has(idVal)) {
        idOccurrences.set(idVal, []);
      }
      idOccurrences.get(idVal).push(el);
    }

    for (const [idVal, nodes] of idOccurrences.entries()) {
      if (nodes.length > 1) {
        // First occurrence is kept; subsequent duplicates are flagged
        for (let i = 1; i < nodes.length; i++) {
          const duplicateNode = nodes[i];

          diagnostics.push(
            this.createDiagnostic({
              message: `Duplicate id="${idVal}" detected. Every element id must be unique within the document. Automatic patch withheld to prevent breaking CSS, JavaScript, or anchor references; resolve the duplicate ID and its corresponding references manually.`,
              node: duplicateNode,
              safety: 'caution',
              patches: []
            })
          );
        }
      }
    }

    return diagnostics;
  }
}
