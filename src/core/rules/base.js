/**
 * fix11y - Base Rule Contract.
 * All accessibility remediation rules extend BaseRule.
 */

export class BaseRule {
  /**
   * @param {object} meta
   * @param {string} meta.id - Unique rule identifier (e.g. 'img-alt')
   * @param {string|string[]} meta.wcag - Associated WCAG Success Criteria (e.g. '1.1.1')
   * @param {string} meta.description - Human-readable description of violation
   * @param {string} [meta.plainLanguage] - Plain-language educational explanation
   * @param {'element'|'document'} [meta.scope='element'] - Evaluation scope
   * @param {'error'|'warning'} [meta.severity='error'] - Severity level (consumed by reporters)
   * @param {'safe'|'caution'} [meta.safety='safe'] - Remediation safety tier
   */
  constructor({
    id,
    wcag,
    description,
    plainLanguage = '',
    scope = 'element',
    severity = 'error',
    safety = 'safe'
  }) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('Rule ID must be a non-empty string');
    }
    this.id = id;
    this.wcag = Array.isArray(wcag) ? wcag : [wcag];
    this.description = description;
    this.plainLanguage = plainLanguage || description;
    this.scope = scope;
    this.severity = severity;
    this.safety = safety;
  }

  /**
   * Evaluates the CST against this rule.
   * @param {object} cst - Root CST node
   * @param {object} [context={}] - Optional evaluation context (e.g. filepath)
   * @returns {Array<object>} List of Diagnostic objects
   */
  evaluate(cst, context = {}) {
    throw new Error(`Rule '${this.id}' must implement evaluate() method`);
  }

  /**
   * Helper to create a standardized Diagnostic object.
   * @param {object} params
   * @param {string} params.message
   * @param {object} params.node
   * @param {Array<object>} [params.patches=[]]
   * @param {'error'|'warning'} [params.severity]
   * @param {'safe'|'caution'} [params.safety]
   * @param {string} [params.plainLanguage]
   * @param {'element'|'document'} [params.scope]
   * @returns {object}
   */
  createDiagnostic({
    message,
    node,
    patches = [],
    severity = this.severity,
    safety = this.safety,
    plainLanguage = this.plainLanguage,
    scope = this.scope
  }) {
    return {
      ruleId: this.id,
      wcag: this.wcag,
      message,
      plainLanguage,
      scope,
      severity,
      safety,
      node,
      loc: node.loc ? node.loc.start : { line: 1, column: 1 },
      patches
    };
  }
}
