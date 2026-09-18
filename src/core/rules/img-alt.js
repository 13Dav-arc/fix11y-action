/**
 * fix11y - Rule: img-alt (WCAG 2.1 AA 1.1.1 Non-text Content)
 * Detects <img> elements missing the alt attribute and injects contextual alt="".
 */

import { BaseRule } from './base.js';
import { getElementsByTagName, hasAttribute, getAttributeValue, getTextContent } from '../parser/parser.js';
import { createInsertAttributePatch } from '../parser/patcher.js';

export class ImgAltRule extends BaseRule {
  constructor() {
    super({
      id: 'img-alt',
      wcag: '1.1.1',
      description: '<img> elements must have an alt attribute to convey meaning or alt="" if decorative.',
      plainLanguage: 'Images without alt text are invisible to screen reader users; they just hear "image" with no context.',
      scope: 'element',
      severity: 'error',
      safety: 'safe'
    });
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];
    const images = getElementsByTagName(cst, 'img');

    for (const img of images) {
      if (!hasAttribute(img, 'alt')) {
        let altValue = '';

        // If img has title attribute, use it as contextual alt text
        const titleVal = getAttributeValue(img, 'title');
        if (titleVal) {
          altValue = titleVal;
        }

        const patch = createInsertAttributePatch(
          img,
          'alt',
          altValue,
          '"',
          `Add alt="${altValue}" to <img src="${getAttributeValue(img, 'src') || ''}">`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: '<img> element is missing an "alt" attribute.',
            node: img,
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
