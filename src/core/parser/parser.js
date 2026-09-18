/**
 * fix11y - Lossless Concrete Syntax Tree (CST) Parser and AST Traversal Helpers.
 * Preserves template partials, void tags, comments, and character offsets.
 */

import {
  tokenize,
  TokenType,
  VOID_ELEMENTS,
  createLocationTracker
} from './tokenizer.js';

/**
 * Parses source markup into a Concrete Syntax Tree (CST).
 * @param {string} source
 * @returns {object} Root CST node
 */
export function parse(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Source markup must be a string');
  }

  const getLoc = createLocationTracker(source);
  const tokens = tokenize(source);

  const root = {
    type: 'root',
    children: [],
    startOffset: 0,
    endOffset: source.length,
    loc: {
      start: { line: 1, column: 1 },
      end: getLoc(source.length)
    },
    source
  };

  const stack = [root];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const currentParent = stack[stack.length - 1];

    switch (token.type) {
      case TokenType.TEXT: {
        const textNode = {
          type: 'text',
          value: token.value,
          raw: token.raw,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
          loc: token.loc,
          parent: currentParent
        };
        currentParent.children.push(textNode);
        break;
      }

      case TokenType.RAW_TEXT: {
        const rawTextNode = {
          type: 'raw_text',
          value: token.value,
          raw: token.raw,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
          loc: token.loc,
          parent: currentParent
        };
        currentParent.children.push(rawTextNode);
        break;
      }

      case TokenType.COMMENT: {
        const commentNode = {
          type: 'comment',
          value: token.value,
          raw: token.raw,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
          loc: token.loc,
          parent: currentParent
        };
        currentParent.children.push(commentNode);
        break;
      }

      case TokenType.MUSTACHE: {
        const mustacheNode = {
          type: 'mustache',
          subType: token.subType,
          expression: token.expression,
          raw: token.raw,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
          loc: token.loc,
          parent: currentParent
        };
        currentParent.children.push(mustacheNode);
        break;
      }

      case TokenType.DOCTYPE: {
        const doctypeNode = {
          type: 'doctype',
          raw: token.raw,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
          loc: token.loc,
          parent: currentParent
        };
        currentParent.children.push(doctypeNode);
        break;
      }

      case TokenType.TAG_OPEN: {
        const isVoid = token.isVoid || VOID_ELEMENTS.has(token.tagName);
        const selfClosing = token.selfClosing || isVoid;

        const elementNode = {
          type: 'element',
          tagName: token.tagName,
          rawTagName: token.rawTagName,
          attributes: token.attributes,
          children: [],
          selfClosing,
          isVoid,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
          openTag: {
            startOffset: token.startOffset,
            endOffset: token.endOffset,
            raw: token.raw,
            loc: token.loc
          },
          closeTag: null,
          loc: {
            start: token.loc.start,
            end: token.loc.end
          },
          parent: currentParent
        };

        currentParent.children.push(elementNode);

        // If not self-closing and not void, push to stack
        if (!selfClosing) {
          stack.push(elementNode);
        }
        break;
      }

      case TokenType.TAG_CLOSE: {
        const closeTagName = token.tagName;
        let matchIdx = -1;

        // Search stack upwards for matching open tag
        for (let s = stack.length - 1; s > 0; s--) {
          if (stack[s].tagName === closeTagName) {
            matchIdx = s;
            break;
          }
        }

        if (matchIdx !== -1) {
          // Close all intermediate unclosed tags
          while (stack.length > matchIdx + 1) {
            const unclosed = stack.pop();
            unclosed.endOffset = token.startOffset;
            unclosed.loc.end = token.loc.start;
          }

          const matchedNode = stack.pop();
          matchedNode.closeTag = {
            startOffset: token.startOffset,
            endOffset: token.endOffset,
            raw: token.raw,
            loc: token.loc
          };
          matchedNode.endOffset = token.endOffset;
          matchedNode.loc.end = token.loc.end;
        } else {
          // Standalone / orphan closing tag, keep as comment/raw or orphan
          const orphanNode = {
            type: 'orphan_tag_close',
            tagName: closeTagName,
            raw: token.raw,
            startOffset: token.startOffset,
            endOffset: token.endOffset,
            loc: token.loc,
            parent: currentParent
          };
          currentParent.children.push(orphanNode);
        }
        break;
      }
    }
  }

  // Close any unclosed nodes remaining on stack
  while (stack.length > 1) {
    const unclosed = stack.pop();
    unclosed.endOffset = source.length;
    unclosed.loc.end = getLoc(source.length);
  }

  return root;
}

/**
 * Traverses CST depth-first calling visitor methods.
 * @param {object} node
 * @param {{ enter?: (node: object, parent: object|null) => boolean|void, leave?: (node: object, parent: object|null) => void }} visitor
 * @param {object|null} parent
 */
export function walk(node, visitor, parent = null) {
  if (!node) return;

  let shouldContinue = true;
  if (visitor.enter) {
    const res = visitor.enter(node, parent);
    if (res === false) {
      shouldContinue = false;
    }
  }

  if (shouldContinue && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i], visitor, node);
    }
  }

  if (visitor.leave) {
    visitor.leave(node, parent);
  }
}

/**
 * Finds all nodes matching a predicate.
 * @param {object} cst
 * @param {(node: object) => boolean} predicate
 * @returns {Array<object>}
 */
export function findNodes(cst, predicate) {
  const matches = [];
  walk(cst, {
    enter(node) {
      if (predicate(node)) {
        matches.push(node);
      }
    }
  });
  return matches;
}

/**
 * Finds all element nodes with given tag name (case-insensitive) or '*' for all elements.
 * @param {object} cst
 * @param {string} tagName
 * @returns {Array<object>}
 */
export function getElementsByTagName(cst, tagName) {
  const target = tagName.toLowerCase();
  return findNodes(cst, (node) => {
    if (node.type !== 'element') return false;
    return target === '*' || node.tagName === target;
  });
}

/**
 * Retrieves attribute by name (case-insensitive) from an element node.
 * @param {object} node
 * @param {string} attrName
 * @returns {object|undefined}
 */
export function getAttribute(node, attrName) {
  if (!node || node.type !== 'element' || !Array.isArray(node.attributes)) {
    return undefined;
  }
  const target = attrName.toLowerCase();
  return node.attributes.find((attr) => !attr.isMustache && attr.name.toLowerCase() === target);
}

/**
 * Checks if an element node has a specific attribute.
 * @param {object} node
 * @param {string} attrName
 * @returns {boolean}
 */
export function hasAttribute(node, attrName) {
  return getAttribute(node, attrName) !== undefined;
}

/**
 * Retrieves attribute value by name (case-insensitive) from an element node.
 * @param {object} node
 * @param {string} attrName
 * @returns {string|null}
 */
export function getAttributeValue(node, attrName) {
  const attr = getAttribute(node, attrName);
  return attr ? attr.value : null;
}

/**
 * Extracts inner text content recursively from a node.
 * @param {object} node
 * @returns {string}
 */
export function getTextContent(node) {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'raw_text') {
    return node.value;
  }
  if (node.type === 'mustache') {
    return node.raw;
  }
  if (Array.isArray(node.children)) {
    return node.children.map(getTextContent).join('');
  }
  return '';
}
