/**
 * fix11y - Rule: empty-heading (WCAG 2.1/2.2 AA 1.3.1 Info and Relationships, 2.4.6 Headings and Labels)
 * Detects <h1> through <h6> elements that lack discernible text or an accessible name.
 */

import { BaseRule } from './base.js';
import { findNodes, getAttributeValue, getTextContent } from '../parser/parser.js';
import { createInsertAttributePatch } from '../parser/patcher.js';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export class EmptyHeadingRule extends BaseRule {
  constructor() {
    super({
      id: 'empty-heading',
      wcag: ['1.3.1', '2.4.6'],
      description: 'Heading elements (<h1>–<h6>) must contain accessible text content.',
      plainLanguage: 'Screen reader users rely on headings to skim page structure; empty headings create phantom outline stops.',
      scope: 'element',
      severity: 'error',
      safety: 'caution'
    });
  }

  /**
   * Checks if a heading element has accessible content.
   * @param {object} node
   * @returns {boolean}
   */
  hasAccessibleContent(node) {
    const ariaLabel = (getAttributeValue(node, 'aria-label') || '').trim();
    if (ariaLabel) return true;

    const ariaLabelledby = (getAttributeValue(node, 'aria-labelledby') || '').trim();
    if (ariaLabelledby) return true;

    const text = getTextContent(node).trim();
    if (text) return true;

    const images = findNodes(node, (n) => n.type === 'element' && n.tagName === 'img');
    for (const img of images) {
      if ((getAttributeValue(img, 'alt') || '').trim()) return true;
    }

    const svgs = findNodes(node, (n) => n.type === 'element' && n.tagName === 'svg');
    for (const svg of svgs) {
      if ((getAttributeValue(svg, 'aria-label') || '').trim()) return true;
      const titles = findNodes(svg, (n) => n.type === 'element' && n.tagName === 'title');
      if (titles.some((t) => getTextContent(t).trim())) return true;
    }

    return false;
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];
    const headings = findNodes(cst, (n) => n.type === 'element' && HEADING_TAGS.has(n.tagName));

    for (const heading of headings) {
      if (!this.hasAccessibleContent(heading)) {
        const patch = createInsertAttributePatch(
          heading,
          'aria-label',
          'Section Heading',
          '"',
          `Add aria-label="Section Heading" to empty <${heading.tagName}> (review content)`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: `<${heading.tagName}> heading element has no accessible text or label.`,
            node: heading,
            safety: 'caution',
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
