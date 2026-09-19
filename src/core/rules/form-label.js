/**
 * fix11y - Rule: form-label (WCAG 2.1 AA 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value)
 * Detects form controls without accessible labels and pairs them with <label for="..."> or injects aria-label.
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
import { deriveAccessibleName, isBlocklisted } from './naming.js';

const IGNORED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

export class FormLabelRule extends BaseRule {
  constructor() {
    super({
      id: 'form-label',
      wcag: ['1.3.1', '4.1.2'],
      description: 'Form controls (<input>, <select>, <textarea>) must have an accessible label.',
      plainLanguage: 'Form inputs require an associated <label> or aria-label so screen readers announce their purpose.',
      scope: 'element',
      severity: 'error',
      safety: 'caution'
    });
  }

  /**
   * Checks if an element is wrapped inside a <label> ancestor.
   * @param {object} node
   * @returns {boolean}
   */
  isWrappedInLabel(node) {
    let curr = node.parent;
    while (curr && curr.type === 'element') {
      if (curr.tagName === 'label') {
        return true;
      }
      curr = curr.parent;
    }
    return false;
  }

  /**
   * Generates a deterministic ID for an input element.
   * @param {object} node
   * @param {number} fallbackIndex
   * @returns {string}
   */
  generateDeterministicId(node, fallbackIndex) {
    const name = getAttributeValue(node, 'name');
    if (name) {
      const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (clean) return `${clean}-input`;
    }

    const type = getAttributeValue(node, 'type');
    if (type && !['text', 'password'].includes(type)) {
      return `${type}-input-${fallbackIndex}`;
    }

    return `${node.tagName}-${fallbackIndex}`;
  }

  /**
   * Generates an accessible label text derived from element attributes.
   * @param {object} node
   * @returns {string|null}
   */
  deriveAriaLabel(node) {
    const derived = deriveAccessibleName(node, { type: 'input' });
    if (derived && !isBlocklisted(derived, { type: 'input' })) {
      return derived;
    }

    const placeholder = getAttributeValue(node, 'placeholder');
    if (placeholder && placeholder.trim() && !isBlocklisted(placeholder.trim(), { type: 'input' })) {
      return placeholder.trim();
    }

    const name = getAttributeValue(node, 'name');
    if (name && name.trim()) {
      const formatted = name
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
      if (formatted && !isBlocklisted(formatted, { type: 'input' })) {
        return formatted;
      }
    }

    const type = getAttributeValue(node, 'type');
    if (type && !['text', 'hidden', 'password'].includes(type)) {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      if (!isBlocklisted(typeLabel, { type: 'input' })) {
        return typeLabel;
      }
    }

    return null;
  }

  /**
   * Identifies an unlinked label that is in physical or semantic proximity to the control.
   * @param {object} control
   * @param {Array<object>} availableLabels
   * @returns {object|null}
   */
  findProximityLabel(control, availableLabels) {
    if (!availableLabels.length || !control.parent) return null;

    const availableSet = new Set(availableLabels);
    const siblings = control.parent.children || [];
    const controlIndex = siblings.indexOf(control);

    // 1. Immediate sibling check (preceding non-whitespace element)
    if (controlIndex !== -1) {
      for (let i = controlIndex - 1; i >= 0; i--) {
        const sib = siblings[i];
        if (sib.type === 'element') {
          if (availableSet.has(sib)) {
            return sib;
          }
          break;
        }
      }

      // Check following sibling (especially for checkbox/radio)
      for (let i = controlIndex + 1; i < siblings.length; i++) {
        const sib = siblings[i];
        if (sib.type === 'element') {
          if (availableSet.has(sib)) {
            return sib;
          }
          break;
        }
      }
    }

    // 2. Enclosing container check (if single unlinked label in container)
    let container = control.parent;
    const CONTAINER_TAGS = new Set(['div', 'p', 'li', 'fieldset', 'section', 'td', 'th']);
    if (container && CONTAINER_TAGS.has(container.tagName)) {
      const containerLabels = findNodes(container, (n) => availableSet.has(n));
      if (containerLabels.length === 1) {
        return containerLabels[0];
      }
    }

    // 3. Semantic attribute correlation
    const name = (getAttributeValue(control, 'name') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const placeholder = (getAttributeValue(control, 'placeholder') || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    if (name || placeholder) {
      let bestMatch = null;
      let minDistance = Infinity;

      for (const label of availableLabels) {
        const labelText = getTextContent(label).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!labelText) continue;

        const matchesName = name && (labelText.includes(name) || name.includes(labelText));
        const matchesPlaceholder = placeholder && (labelText.includes(placeholder) || placeholder.includes(labelText));

        if (matchesName || matchesPlaceholder) {
          const dist = Math.abs(label.startOffset - control.startOffset);
          if (dist < minDistance && dist < 1000) {
            minDistance = dist;
            bestMatch = label;
          }
        }
      }

      if (bestMatch) {
        return bestMatch;
      }
    }

    return null;
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];

    // Collect all <label> elements and their 'for' attributes
    const allLabels = getElementsByTagName(cst, 'label');
    const linkedForIds = new Set();
    const unlinkedLabels = [];

    for (const label of allLabels) {
      const forVal = getAttributeValue(label, 'for');
      if (forVal) {
        linkedForIds.add(forVal.trim().toLowerCase());
      } else {
        // Only consider as unlinked if it doesn't wrap an input already
        const hasNestedInput = findNodes(label, (n) =>
          n.type === 'element' && ['input', 'select', 'textarea'].includes(n.tagName)
        ).length > 0;

        if (!hasNestedInput) {
          unlinkedLabels.push(label);
        }
      }
    }

    // Inspect all form controls
    const formControls = findNodes(cst, (n) => {
      if (n.type !== 'element') return false;
      if (['select', 'textarea'].includes(n.tagName)) return true;
      if (n.tagName === 'input') {
        const type = (getAttributeValue(n, 'type') || 'text').toLowerCase();
        return !IGNORED_INPUT_TYPES.has(type);
      }
      return false;
    });

    let autoIndex = 1;
    let remainingLabels = [...unlinkedLabels];

    for (const control of formControls) {
      // Check 1: aria-label or aria-labelledby
      if (hasAttribute(control, 'aria-label') || hasAttribute(control, 'aria-labelledby')) {
        continue;
      }

      // Check 2: Wrapped in <label>
      if (this.isWrappedInLabel(control)) {
        continue;
      }

      // Check 3: Has ID matching an existing <label for="...">
      const idVal = getAttributeValue(control, 'id');
      if (idVal && linkedForIds.has(idVal.trim().toLowerCase())) {
        continue;
      }

      // Violation detected! Construct patches
      const patches = [];

      // Proximity pairing check
      const targetLabel = this.findProximityLabel(control, remainingLabels);

      if (targetLabel) {
        const idx = remainingLabels.indexOf(targetLabel);
        if (idx !== -1) remainingLabels.splice(idx, 1);

        let finalId = idVal ? idVal.trim() : this.generateDeterministicId(control, autoIndex++);

        if (!idVal) {
          patches.push(
            createInsertAttributePatch(
              control,
              'id',
              finalId,
              '"',
              `Add id="${finalId}" to <${control.tagName}>`
            )
          );
        }

        patches.push(
          createInsertAttributePatch(
            targetLabel,
            'for',
            finalId,
            '"',
            `Link <label> with for="${finalId}"`
          )
        );
      } else {
        // No proximity label available: Inject aria-label for direct accessible name
        const ariaLabelText = this.deriveAriaLabel(control);
        if (ariaLabelText && !isBlocklisted(ariaLabelText, { type: 'input' })) {
          patches.push(
            createInsertAttributePatch(
              control,
              'aria-label',
              ariaLabelText,
              '"',
              `Add aria-label="${ariaLabelText}" to <${control.tagName}>`
            )
          );
        }
      }

      diagnostics.push(
        this.createDiagnostic({
          message: patches.length > 0
            ? `\`<${control.tagName}>\` is missing an associated \`<label>\` or aria-label.`
            : `\`<${control.tagName}>\` is missing an associated \`<label>\` or aria-label. Generic placeholders were suppressed.`,
          node: control,
          safety: 'caution',
          patches
        })
      );
    }

    return diagnostics;
  }
}
