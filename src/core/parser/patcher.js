/**
 * fix11y - Offset-Based Surgical Range Patcher.
 * Applies non-overlapping string replacements to exact source byte ranges,
 * preserving 100% of surrounding whitespace, quotes, comments, and line endings.
 */

import { getAttribute } from './parser.js';

/**
 * Validates and applies an array of non-overlapping patches to the source string.
 * @param {string} source - The original source code string.
 * @param {Array<{ startOffset: number, endOffset: number, replacement: string, description?: string }>} patches
 * @returns {string} The patched source code string.
 */
export function applyPatches(source, patches) {
  if (typeof source !== 'string') {
    throw new TypeError('Source must be a string');
  }

  if (!Array.isArray(patches) || patches.length === 0) {
    return source;
  }

  // Clone and validate each patch
  const normalized = patches.map((p, idx) => {
    if (typeof p.startOffset !== 'number' || typeof p.endOffset !== 'number' || typeof p.replacement !== 'string') {
      throw new TypeError(`Invalid patch structure at index ${idx}: must have startOffset, endOffset, and replacement`);
    }
    if (p.startOffset < 0 || p.endOffset > source.length || p.startOffset > p.endOffset) {
      throw new RangeError(
        `Patch at index ${idx} has invalid offset range [${p.startOffset}, ${p.endOffset}] for source length ${source.length}`
      );
    }
    return { ...p };
  });

  // Sort ascending by startOffset to detect overlaps
  normalized.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  for (let i = 0; i < normalized.length - 1; i++) {
    const current = normalized[i];
    const next = normalized[i + 1];

    if (current.endOffset > next.startOffset) {
      throw new Error(
        `Overlapping patches detected: Patch [${current.startOffset}, ${current.endOffset}] ("${current.description || ''}") overlaps with Patch [${next.startOffset}, ${next.endOffset}] ("${next.description || ''}")`
      );
    }
  }

  // Apply patches right-to-left (descending startOffset) to keep earlier offsets stable
  let result = source;
  const descending = [...normalized].sort((a, b) => b.startOffset - a.startOffset);

  for (const patch of descending) {
    result = result.slice(0, patch.startOffset) + patch.replacement + result.slice(patch.endOffset);
  }

  return result;
}

/**
 * Creates a patch to insert an attribute into an element's opening tag.
 * @param {object} node - CST element node
 * @param {string} attrName - Name of attribute to insert
 * @param {string|null} [attrValue=null] - Value of attribute (or null for boolean attribute)
 * @param {string} [quote='"'] - Quote character to use
 * @param {string} [description] - Diagnostic description
 * @returns {object} Patch object
 */
export function createInsertAttributePatch(node, attrName, attrValue = null, quote = '"', description = '') {
  if (!node || node.type !== 'element' || !node.openTag) {
    throw new Error('Invalid element node for attribute insertion');
  }

  let insertPos;
  if (Array.isArray(node.attributes) && node.attributes.length > 0) {
    const lastAttr = node.attributes[node.attributes.length - 1];
    insertPos = lastAttr.endOffset;
  } else {
    insertPos = node.openTag.startOffset + 1 + node.rawTagName.length;
  }

  const formattedAttr =
    attrValue === null || attrValue === undefined
      ? ` ${attrName}`
      : ` ${attrName}=${quote}${attrValue}${quote}`;

  return {
    startOffset: insertPos,
    endOffset: insertPos,
    replacement: formattedAttr,
    description: description || `Insert attribute '${attrName}' into <${node.tagName}>`
  };
}

/**
 * Creates a patch to update an existing attribute on an element node.
 * @param {object} node - CST element node
 * @param {string} attrName - Name of attribute to update
 * @param {string} newValue - New value for attribute
 * @param {string|null} [quote=null] - Quote character (defaults to existing quote or '"')
 * @param {string} [description] - Diagnostic description
 * @returns {object} Patch object
 */
export function createUpdateAttributePatch(node, attrName, newValue, quote = null, description = '') {
  const attr = getAttribute(node, attrName);
  if (!attr) {
    throw new Error(`Attribute '${attrName}' not found on <${node.tagName}> node`);
  }

  const q = quote !== null ? quote : attr.quote || '"';
  const replacement = `${attrName}=${q}${newValue}${q}`;

  return {
    startOffset: attr.startOffset,
    endOffset: attr.endOffset,
    replacement,
    description: description || `Update attribute '${attrName}' on <${node.tagName}>`
  };
}

/**
 * Creates a patch to remove an attribute from an element node.
 * @param {object} node - CST element node
 * @param {string} attrName - Name of attribute to remove
 * @param {string} [description] - Diagnostic description
 * @returns {object} Patch object
 */
export function createRemoveAttributePatch(node, attrName, description = '') {
  const attr = getAttribute(node, attrName);
  if (!attr) {
    throw new Error(`Attribute '${attrName}' not found on <${node.tagName}> node`);
  }

  return {
    startOffset: attr.startOffset,
    endOffset: attr.endOffset,
    replacement: '',
    description: description || `Remove attribute '${attrName}' from <${node.tagName}>`
  };
}

/**
 * Creates patches to swap an element's tag name (e.g. <div>...</div> to <button>...</button>).
 * @param {object} node - CST element node
 * @param {string} newTagName - The new tag name
 * @param {string} [description] - Diagnostic description
 * @returns {Array<object>} Array of patches for open and close tags
 */
export function createSwapTagNamePatch(node, newTagName, description = '') {
  if (!node || node.type !== 'element') {
    throw new Error('Invalid element node for tag swap');
  }

  const patches = [];

  // Open tag name replacement: '<' + tagName
  const openNameStart = node.openTag.startOffset + 1;
  const openNameEnd = openNameStart + node.rawTagName.length;

  patches.push({
    startOffset: openNameStart,
    endOffset: openNameEnd,
    replacement: newTagName,
    description: description || `Swap opening <${node.rawTagName}> to <${newTagName}>`
  });

  // Close tag name replacement if it has a closing tag: '</' + tagName
  if (node.closeTag) {
    const closeNameStart = node.closeTag.startOffset + 2;
    const closeNameEnd = closeNameStart + node.rawTagName.length;

    patches.push({
      startOffset: closeNameStart,
      endOffset: closeNameEnd,
      replacement: newTagName,
      description: description || `Swap closing </${node.rawTagName}> to </${newTagName}>`
    });
  }

  return patches;
}

/**
 * Creates patches to wrap an element with before and after markup.
 * @param {object} node - CST element node
 * @param {string} beforeMarkup - Markup to insert before element
 * @param {string} afterMarkup - Markup to insert after element
 * @param {string} [description] - Diagnostic description
 * @returns {Array<object>} Array of 2 patches
 */
export function createWrapNodePatch(node, beforeMarkup, afterMarkup, description = '') {
  if (!node) {
    throw new Error('Invalid node for wrapping');
  }

  return [
    {
      startOffset: node.startOffset,
      endOffset: node.startOffset,
      replacement: beforeMarkup,
      description: description ? `${description} (before)` : `Wrap before node`
    },
    {
      startOffset: node.endOffset,
      endOffset: node.endOffset,
      replacement: afterMarkup,
      description: description ? `${description} (after)` : `Wrap after node`
    }
  ];
}
