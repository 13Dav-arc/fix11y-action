/**
 * fix11y - Rule: button-semantics (WCAG 2.1 AA 2.1.1 Keyboard, 4.1.2 Name, Role, Value)
 * Transforms non-semantic clickable elements (<div onclick>, <span onclick>) into <button type="button">
 * and ensures <button> elements have an accessible name.
 */

import { BaseRule } from './base.js';
import {
  findNodes,
  getElementsByTagName,
  hasAttribute,
  getAttributeValue,
  getTextContent
} from '../parser/parser.js';
import {
  createSwapTagNamePatch,
  createInsertAttributePatch,
  createRemoveAttributePatch
} from '../parser/patcher.js';

export class ButtonSemanticsRule extends BaseRule {
  constructor() {
    super({
      id: 'button-semantics',
      wcag: ['2.1.1', '4.1.2'],
      description: 'Interactive click triggers must be semantic <button> elements with an accessible name.',
      plainLanguage: 'Clickable divs and spans are invisible to keyboard navigation and screen readers; real <button> elements provide native focus and activation.',
      scope: 'element',
      severity: 'error',
      safety: 'caution'
    });
  }

  /**
   * Derives an accessible name for empty buttons from class names or IDs.
   * @param {object} node
   * @returns {string}
   */
  deriveButtonName(node) {
    const cls = getAttributeValue(node, 'class') || '';
    const id = getAttributeValue(node, 'id') || '';
    const combined = `${cls} ${id}`.toLowerCase();

    if (combined.includes('close') || combined.includes('dismiss')) return 'Close';
    if (combined.includes('search')) return 'Search';
    if (combined.includes('menu') || combined.includes('hamburger')) return 'Menu';
    if (combined.includes('next')) return 'Next';
    if (combined.includes('prev')) return 'Previous';
    if (combined.includes('delete') || combined.includes('trash') || combined.includes('remove')) return 'Delete';
    if (combined.includes('edit')) return 'Edit';
    if (combined.includes('submit')) return 'Submit';
    if (combined.includes('save')) return 'Save';

    return 'Action';
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];

    // Part 1: Detect non-semantic interactive click elements (div, span, a without href)
    const nonSemanticClickables = findNodes(cst, (n) => {
      if (n.type !== 'element') return false;
      const tag = n.tagName;

      if (['div', 'span'].includes(tag)) {
        return hasAttribute(n, 'onclick') || getAttributeValue(n, 'role') === 'button';
      }

      if (tag === 'a') {
        const hasHref = hasAttribute(n, 'href');
        return !hasHref && (hasAttribute(n, 'onclick') || getAttributeValue(n, 'role') === 'button');
      }

      return false;
    });

    for (const node of nonSemanticClickables) {
      const patches = [];

      // 1. Swap tag name to <button>
      patches.push(...createSwapTagNamePatch(node, 'button'));

      // 2. Add type="button" if not present
      if (!hasAttribute(node, 'type')) {
        patches.push(
          createInsertAttributePatch(
            node,
            'type',
            'button',
            '"',
            `Add type="button" to new <button>`
          )
        );
      }

      // 3. Remove redundant role="button" if present
      if (getAttributeValue(node, 'role') === 'button') {
        patches.push(createRemoveAttributePatch(node, 'role', 'Remove redundant role="button"'));
      }

      // 4. If element is empty and has no accessible name, add aria-label
      const text = getTextContent(node).trim();
      const hasAriaLabel = hasAttribute(node, 'aria-label') || hasAttribute(node, 'aria-labelledby');
      const hasTitle = hasAttribute(node, 'title');
      const nestedImgWithAlt = findNodes(node, (n) =>
        n.type === 'element' && n.tagName === 'img' && !!getAttributeValue(n, 'alt')
      ).length > 0;

      if (!text && !hasAriaLabel && !hasTitle && !nestedImgWithAlt) {
        const derivedName = this.deriveButtonName(node);
        patches.push(
          createInsertAttributePatch(
            node,
            'aria-label',
            derivedName,
            '"',
            `Add aria-label="${derivedName}" to empty <button>`
          )
        );
      }

      diagnostics.push(
        this.createDiagnostic({
          message: `Non-semantic <${node.tagName}> has click handler or role="button". Convert to <button type="button">.`,
          node,
          safety: 'caution',
          patches
        })
      );
    }

    // Part 2: Detect <button> elements without accessible name
    const buttons = getElementsByTagName(cst, 'button');
    for (const btn of buttons) {
      // Check if button has text content, aria-label, aria-labelledby, or title
      const text = getTextContent(btn).trim();
      const hasAriaLabel = hasAttribute(btn, 'aria-label') || hasAttribute(btn, 'aria-labelledby');
      const hasTitle = hasAttribute(btn, 'title');

      // Also check if button contains an <img> with alt text
      const nestedImgWithAlt = findNodes(btn, (n) =>
        n.type === 'element' && n.tagName === 'img' && !!getAttributeValue(n, 'alt')
      ).length > 0;

      if (!text && !hasAriaLabel && !hasTitle && !nestedImgWithAlt) {
        const derivedName = this.deriveButtonName(btn);
        const patch = createInsertAttributePatch(
          btn,
          'aria-label',
          derivedName,
          '"',
          `Add aria-label="${derivedName}" to empty <button>`
        );

        diagnostics.push(
          this.createDiagnostic({
            message: '<button> is missing an accessible name (no text, aria-label, or title).',
            node: btn,
            safety: 'safe',
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
