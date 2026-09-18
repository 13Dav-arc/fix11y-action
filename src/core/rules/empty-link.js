/**
 * fix11y - Rule: empty-link (WCAG 2.1/2.2 AA 2.4.4 Link Purpose In Context, 4.1.2 Name, Role, Value)
 * Detects <a> elements with an href attribute that lack an accessible name (text, image alt, or aria-label).
 */

import { BaseRule } from './base.js';
import {
  getElementsByTagName,
  hasAttribute,
  getAttributeValue,
  getTextContent,
  findNodes
} from '../parser/parser.js';
import { createInsertAttributePatch } from '../parser/patcher.js';

export class EmptyLinkRule extends BaseRule {
  constructor() {
    super({
      id: 'empty-link',
      wcag: ['2.4.4', '4.1.2'],
      description: 'Links (<a> with href) must have accessible text content or an aria-label.',
      plainLanguage: 'Links without visible text or an aria-label cannot be identified or operated by screen reader users.',
      scope: 'element',
      severity: 'error',
      safety: 'caution'
    });
  }

  /**
   * Checks if an anchor has accessible text content or image alt text.
   * @param {object} node
   * @returns {boolean}
   */
  hasAccessibleName(node) {
    // 1. Direct aria attributes
    const ariaLabel = (getAttributeValue(node, 'aria-label') || '').trim();
    if (ariaLabel) return true;

    const ariaLabelledby = (getAttributeValue(node, 'aria-labelledby') || '').trim();
    if (ariaLabelledby) return true;

    // 2. Direct or nested text content
    const text = getTextContent(node).trim();
    if (text) return true;

    // 3. Nested <img> with non-empty alt
    const images = findNodes(node, (n) => n.type === 'element' && n.tagName === 'img');
    for (const img of images) {
      const alt = (getAttributeValue(img, 'alt') || '').trim();
      if (alt) return true;
    }

    // 4. Nested <svg> with title or aria-label
    const svgs = findNodes(node, (n) => n.type === 'element' && n.tagName === 'svg');
    for (const svg of svgs) {
      if ((getAttributeValue(svg, 'aria-label') || '').trim()) return true;
      const titles = findNodes(svg, (n) => n.type === 'element' && n.tagName === 'title');
      if (titles.some((t) => getTextContent(t).trim())) return true;
    }

    return false;
  }

  /**
   * Derives a heuristic label from the link's href or class attributes.
   * @param {object} node
   * @returns {string}
   */
  deriveLinkName(node) {
    const href = (getAttributeValue(node, 'href') || '').trim();

    if (href.startsWith('mailto:')) {
      const email = href.slice(7).split('?')[0];
      if (email) return `Email ${email}`;
    }

    if (href.startsWith('tel:')) {
      const phone = href.slice(4);
      if (phone) return `Call ${phone}`;
    }

    if (href.startsWith('#')) {
      const target = href.slice(1).replace(/[-_]+/g, ' ').trim();
      if (target) return `Go to ${target}`;
    }

    try {
      const url = new URL(href, 'https://example.com');
      const pathname = url.pathname.replace(/^\/|\/$/g, '');
      if (pathname) {
        const segment = pathname.split('/').pop()?.replace(/[-_.]+/g, ' ').trim();
        if (segment) {
          return segment.charAt(0).toUpperCase() + segment.slice(1);
        }
      }
    } catch {
      // Fallback below
    }

    return 'Link';
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];
    const links = getElementsByTagName(cst, 'a');

    for (const link of links) {
      // Only evaluate interactive anchors with href
      if (!hasAttribute(link, 'href')) continue;

      if (!this.hasAccessibleName(link)) {
        const label = this.deriveLinkName(link);
        const patch = createInsertAttributePatch(
          link,
          'aria-label',
          label,
          '"',
          `Add aria-label="${label}" to empty link`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: '<a> link has no accessible name or discernible text content.',
            node: link,
            safety: 'caution',
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
