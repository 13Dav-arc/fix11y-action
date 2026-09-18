/**
 * fix11y - Zero-dependency accessibility remediation engine.
 * Programmatic Public API.
 */

export {
  tokenize,
  TokenType,
  MustacheType,
  VOID_ELEMENTS,
  createLocationTracker
} from './parser/tokenizer.js';

export {
  parse,
  walk,
  findNodes,
  getElementsByTagName,
  getAttribute,
  hasAttribute,
  getAttributeValue,
  getTextContent
} from './parser/parser.js';

export {
  applyPatches,
  createInsertAttributePatch,
  createUpdateAttributePatch,
  createRemoveAttributePatch,
  createSwapTagNamePatch,
  createWrapNodePatch
} from './parser/patcher.js';

export {
  BaseRule,
  ImgAltRule,
  FormLabelRule,
  ButtonSemanticsRule,
  AriaLiveStatusRule,
  HtmlLangRule,
  MetaViewportRule,
  DuplicateIdRule,
  EmptyLinkRule,
  EmptyHeadingRule,
  TabindexPositiveRule,
  HeadingOrderRule,
  LandmarkOneMainRule,
  RuleRegistry,
  defaultRegistry,
  evaluateRules,
  remediate
} from './rules/index.js';

export {
  myersDiff,
  createUnifiedDiff,
  splitLines,
  buildHunks
} from './ui/diff.js';

export {
  formatTerminalReport,
  formatJsonReport,
  shouldUseColor
} from './ui/reporter.js';
