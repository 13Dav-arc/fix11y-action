/**
 * fix11y - Rule: html-lang (WCAG 2.1/2.2 AA 3.1.1 Language of Page)
 * Detects <html> tags missing a non-empty lang attribute.
 */

import { BaseRule } from './base.js';
import { getElementsByTagName, hasAttribute, getAttributeValue } from '../parser/parser.js';
import { createInsertAttributePatch, createUpdateAttributePatch } from '../parser/patcher.js';

export class HtmlLangRule extends BaseRule {
  constructor() {
    super({
      id: 'html-lang',
      wcag: '3.1.1',
      description: '<html> elements must specify a valid, non-empty lang attribute.',
      plainLanguage: 'Screen readers need the lang attribute on <html> to choose the correct pronunciation dictionary.',
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
    const htmlElements = getElementsByTagName(cst, 'html');

    for (const html of htmlElements) {
      const hasLang = hasAttribute(html, 'lang');
      const langValue = hasLang ? (getAttributeValue(html, 'lang') || '').trim() : null;

      if (!hasLang || !langValue) {
        let patch;
        if (!hasLang) {
          patch = createInsertAttributePatch(
            html,
            'lang',
            'en',
            '"',
            'Add lang="en" to <html> (verify language for your content)'
          );
        } else {
          patch = createUpdateAttributePatch(
            html,
            'lang',
            'en',
            'Set lang="en" on <html> (verify language for your content)'
          );
        }

        diagnostics.push(
          this.createDiagnostic({
            message: '<html> element is missing a valid "lang" attribute.',
            node: html,
            safety: 'caution',
            patches: [patch]
          })
        );
      }
    }

    return diagnostics;
  }
}
