/**
 * fix11y - Rule: img-alt (WCAG 2.1 AA 1.1.1 Non-text Content)
 * Detects <img> elements missing the alt attribute and injects contextual alt="".
 */

import { BaseRule } from './base.js';
import { getElementsByTagName, hasAttribute, getAttributeValue } from '../parser/parser.js';
import { createInsertAttributePatch } from '../parser/patcher.js';
import { classifyImage, deriveAccessibleName, isBlocklisted } from './naming.js';

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
        const classification = classifyImage(img);

        if (classification === 'decorative') {
          // Branch 1: Explicitly decorative -> inject alt="" with safety: 'safe'
          const patch = createInsertAttributePatch(
            img,
            'alt',
            '',
            '"',
            `Add alt="" to decorative <img src="${getAttributeValue(img, 'src') || ''}">`
          );
          diagnostics.push(
            this.createDiagnostic({
              message: 'Decorative <img> element is missing an "alt" attribute.',
              node: img,
              safety: 'safe',
              patches: [patch]
            })
          );
        } else if (classification === 'meaningful') {
          // Branch 2: Meaningful -> derive accessible name
          const derivedName = deriveAccessibleName(img, { type: 'image' });
          if (derivedName && !isBlocklisted(derivedName, { type: 'image' })) {
            const patch = createInsertAttributePatch(
              img,
              'alt',
              derivedName,
              '"',
              `Add alt="${derivedName}" to meaningful <img src="${getAttributeValue(img, 'src') || ''}">`
            );
            diagnostics.push(
              this.createDiagnostic({
                message: `Meaningful <img> element is missing an "alt" attribute; derived alt="${derivedName}".`,
                node: img,
                safety: 'caution',
                patches: [patch]
              })
            );
          } else {
            // Meaningful, but name undetermined or blocklisted: STRICTLY NO AUTO-PATCH
            diagnostics.push(
              this.createDiagnostic({
                message: 'Meaningful <img> element is missing an "alt" attribute and requires descriptive alt text. Generic placeholders were suppressed.',
                node: img,
                safety: 'caution',
                patches: []
              })
            );
          }
        } else {
          // Branch 3: Unknown / no signal either way -> STRICTLY NO AUTO-PATCH, caution diagnostic
          diagnostics.push(
            this.createDiagnostic({
              message: '<img> element has no alt attribute and cannot be deterministically classified as decorative or meaningful. Add descriptive alt text or alt="" if decorative.',
              node: img,
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
