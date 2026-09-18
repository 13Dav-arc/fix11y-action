/**
 * fix11y - Lossless Character-Offset Tokenizer for HTML5 and Mustache/Handlebars templates.
 * Zero external dependencies.
 */

export const TokenType = {
  DOCTYPE: 'DOCTYPE',
  COMMENT: 'COMMENT',
  MUSTACHE: 'MUSTACHE',
  TAG_OPEN: 'TAG_OPEN',
  TAG_CLOSE: 'TAG_CLOSE',
  TEXT: 'TEXT',
  RAW_TEXT: 'RAW_TEXT'
};

export const MustacheType = {
  INTERPOLATION: 'interpolation',
  UNESCAPED: 'unescaped',
  BLOCK_START: 'block_start',
  BLOCK_END: 'block_end',
  INVERTED: 'inverted',
  PARTIAL: 'partial',
  COMMENT: 'comment'
};

export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Creates a location helper from the input string to calculate 1-indexed { line, column }
 * from a 0-indexed character offset.
 * @param {string} source
 * @returns {(offset: number) => { line: number, column: number }}
 */
export function createLocationTracker(source) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  return function getLoc(offset) {
    const clamped = Math.max(0, Math.min(offset, source.length));
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lineStarts[mid] <= clamped) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const lineIndex = high;
    const line = lineIndex + 1;
    const column = clamped - lineStarts[lineIndex] + 1;
    return { line, column };
  };
}

/**
 * Tokenizes an HTML5 or Mustache/Handlebars template string.
 * @param {string} source
 * @returns {Array<object>} Array of tokens with exact character offsets and line/column locs.
 */
export function tokenize(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Source must be a string');
  }

  const getLoc = createLocationTracker(source);
  const tokens = [];
  let pos = 0;
  const len = source.length;

  while (pos < len) {
    // 1. Triple Mustache {{{ ... }}}
    if (source.startsWith('{{{', pos)) {
      const startOffset = pos;
      const closeIdx = source.indexOf('}}}', pos + 3);
      const endOffset = closeIdx === -1 ? len : closeIdx + 3;
      const raw = source.slice(startOffset, endOffset);
      const expression = closeIdx === -1 ? source.slice(pos + 3) : source.slice(pos + 3, closeIdx);

      tokens.push({
        type: TokenType.MUSTACHE,
        subType: MustacheType.UNESCAPED,
        expression: expression.trim(),
        raw,
        startOffset,
        endOffset,
        loc: {
          start: getLoc(startOffset),
          end: getLoc(endOffset)
        }
      });
      pos = endOffset;
      continue;
    }

    // 2. Double Mustache {{ ... }}
    if (source.startsWith('{{', pos)) {
      const startOffset = pos;
      const closeIdx = source.indexOf('}}', pos + 2);
      const endOffset = closeIdx === -1 ? len : closeIdx + 2;
      const raw = source.slice(startOffset, endOffset);
      const inner = closeIdx === -1 ? source.slice(pos + 2) : source.slice(pos + 2, closeIdx);
      const firstChar = inner.trimStart()[0];

      let subType = MustacheType.INTERPOLATION;
      let expr = inner.trim();

      if (firstChar === '#') {
        subType = MustacheType.BLOCK_START;
        expr = inner.trimStart().slice(1).trim();
      } else if (firstChar === '/') {
        subType = MustacheType.BLOCK_END;
        expr = inner.trimStart().slice(1).trim();
      } else if (firstChar === '^') {
        subType = MustacheType.INVERTED;
        expr = inner.trimStart().slice(1).trim();
      } else if (firstChar === '>') {
        subType = MustacheType.PARTIAL;
        expr = inner.trimStart().slice(1).trim();
      } else if (firstChar === '!') {
        subType = MustacheType.COMMENT;
        expr = inner.trimStart().slice(1).trim();
      } else if (firstChar === '&') {
        subType = MustacheType.UNESCAPED;
        expr = inner.trimStart().slice(1).trim();
      }

      tokens.push({
        type: TokenType.MUSTACHE,
        subType,
        expression: expr,
        raw,
        startOffset,
        endOffset,
        loc: {
          start: getLoc(startOffset),
          end: getLoc(endOffset)
        }
      });
      pos = endOffset;
      continue;
    }

    // 3. HTML Comment <!-- ... -->
    if (source.startsWith('<!--', pos)) {
      const startOffset = pos;
      const closeIdx = source.indexOf('-->', pos + 4);
      const endOffset = closeIdx === -1 ? len : closeIdx + 3;
      const raw = source.slice(startOffset, endOffset);
      const value = closeIdx === -1 ? source.slice(pos + 4) : source.slice(pos + 4, closeIdx);

      tokens.push({
        type: TokenType.COMMENT,
        value,
        raw,
        startOffset,
        endOffset,
        loc: {
          start: getLoc(startOffset),
          end: getLoc(endOffset)
        }
      });
      pos = endOffset;
      continue;
    }

    // 4. DOCTYPE <!DOCTYPE ... >
    if (source.slice(pos, pos + 9).toUpperCase() === '<!DOCTYPE') {
      const startOffset = pos;
      const closeIdx = source.indexOf('>', pos + 9);
      const endOffset = closeIdx === -1 ? len : closeIdx + 1;
      const raw = source.slice(startOffset, endOffset);

      tokens.push({
        type: TokenType.DOCTYPE,
        raw,
        startOffset,
        endOffset,
        loc: {
          start: getLoc(startOffset),
          end: getLoc(endOffset)
        }
      });
      pos = endOffset;
      continue;
    }

    // 5. HTML Closing Tag </tagname>
    if (source.startsWith('</', pos)) {
      const startOffset = pos;
      const closeIdx = source.indexOf('>', pos + 2);
      if (closeIdx !== -1) {
        const tagContent = source.slice(pos + 2, closeIdx).trim();
        const match = tagContent.match(/^([a-zA-Z0-9:-]+)/);
        if (match) {
          const tagName = match[1];
          const endOffset = closeIdx + 1;
          tokens.push({
            type: TokenType.TAG_CLOSE,
            tagName: tagName.toLowerCase(),
            rawTagName: tagName,
            raw: source.slice(startOffset, endOffset),
            startOffset,
            endOffset,
            loc: {
              start: getLoc(startOffset),
              end: getLoc(endOffset)
            }
          });
          pos = endOffset;
          continue;
        }
      }
    }

    // 6. HTML Opening Tag <tagname ... >
    if (source[pos] === '<' && pos + 1 < len && /[a-zA-Z]/.test(source[pos + 1])) {
      const tagToken = parseOpenTag(source, pos, getLoc);
      if (tagToken) {
        tokens.push(tagToken);
        pos = tagToken.endOffset;

        // If tag is <script> or <style> and not self-closing, tokenize raw content
        const lowerTagName = tagToken.tagName.toLowerCase();
        if (!tagToken.selfClosing && !VOID_ELEMENTS.has(lowerTagName) && (lowerTagName === 'script' || lowerTagName === 'style')) {
          const closingPattern = `</${lowerTagName}`;
          let rawEnd = -1;
          for (let i = pos; i <= len - closingPattern.length; i++) {
            if (source.slice(i, i + closingPattern.length).toLowerCase() === closingPattern) {
              rawEnd = i;
              break;
            }
          }
          if (rawEnd === -1) {
            rawEnd = len;
          }
          if (rawEnd > pos) {
            const rawContent = source.slice(pos, rawEnd);
            tokens.push({
              type: TokenType.RAW_TEXT,
              value: rawContent,
              raw: rawContent,
              startOffset: pos,
              endOffset: rawEnd,
              loc: {
                start: getLoc(pos),
                end: getLoc(rawEnd)
              }
            });
            pos = rawEnd;
          }
        }
        continue;
      }
    }

    // 7. Text content up to next tag or mustache
    const startTextOffset = pos;
    let nextSpecial = len;

    for (let i = pos + 1; i < len; i++) {
      if (source[i] === '<' || (source[i] === '{' && i + 1 < len && source[i + 1] === '{')) {
        nextSpecial = i;
        break;
      }
    }

    const textValue = source.slice(startTextOffset, nextSpecial);
    tokens.push({
      type: TokenType.TEXT,
      value: textValue,
      raw: textValue,
      startOffset: startTextOffset,
      endOffset: nextSpecial,
      loc: {
        start: getLoc(startTextOffset),
        end: getLoc(nextSpecial)
      }
    });
    pos = nextSpecial;
  }

  return tokens;
}

/**
 * Parses an open tag token and its attributes from the source.
 * @param {string} source
 * @param {number} startPos
 * @param {(offset: number) => { line: number, column: number }} getLoc
 * @returns {object|null}
 */
function parseOpenTag(source, startPos, getLoc) {
  const len = source.length;
  let pos = startPos + 1; // skip '<'

  // Extract tag name
  const tagNameMatch = source.slice(pos).match(/^([a-zA-Z0-9:-]+)/);
  if (!tagNameMatch) return null;

  const rawTagName = tagNameMatch[1];
  const tagName = rawTagName.toLowerCase();
  pos += rawTagName.length;

  const attributes = [];
  let selfClosing = false;

  while (pos < len) {
    // Skip whitespace
    while (pos < len && /\s/.test(source[pos])) {
      pos++;
    }

    if (pos >= len) break;

    // Check for self-closing '/>'
    if (source.startsWith('/>', pos)) {
      selfClosing = true;
      pos += 2;
      break;
    }

    // Check for closing '>'
    if (source[pos] === '>') {
      pos += 1;
      break;
    }

    // Check for Mustache tag embedded inside attributes (e.g. {{#if disabled}}disabled{{/if}})
    if (source.startsWith('{{{', pos)) {
      const mStart = pos;
      const closeIdx = source.indexOf('}}}', pos + 3);
      const mEnd = closeIdx === -1 ? len : closeIdx + 3;
      const rawMustache = source.slice(mStart, mEnd);

      attributes.push({
        name: rawMustache,
        value: null,
        quote: null,
        raw: rawMustache,
        isMustache: true,
        startOffset: mStart,
        endOffset: mEnd,
        nameStartOffset: mStart,
        nameEndOffset: mEnd,
        valueStartOffset: null,
        valueEndOffset: null,
        loc: {
          start: getLoc(mStart),
          end: getLoc(mEnd)
        }
      });
      pos = mEnd;
      continue;
    }

    if (source.startsWith('{{', pos)) {
      const mStart = pos;
      const closeIdx = source.indexOf('}}', pos + 2);
      const mEnd = closeIdx === -1 ? len : closeIdx + 2;
      const rawMustache = source.slice(mStart, mEnd);

      attributes.push({
        name: rawMustache,
        value: null,
        quote: null,
        raw: rawMustache,
        isMustache: true,
        startOffset: mStart,
        endOffset: mEnd,
        nameStartOffset: mStart,
        nameEndOffset: mEnd,
        valueStartOffset: null,
        valueEndOffset: null,
        loc: {
          start: getLoc(mStart),
          end: getLoc(mEnd)
        }
      });
      pos = mEnd;
      continue;
    }

    // Parse attribute name
    const attrNameStart = pos;
    while (
      pos < len &&
      !/[\s=>/]/.test(source[pos]) &&
      !source.startsWith('{{', pos) &&
      !source.startsWith('/>', pos)
    ) {
      pos++;
    }

    const attrNameEnd = pos;
    const attrName = source.slice(attrNameStart, attrNameEnd);

    if (!attrName) {
      // Advance to avoid infinite loop if unexpected char
      pos++;
      continue;
    }

    // Skip whitespace between name and '='
    const afterNamePos = pos;
    while (pos < len && /\s/.test(source[pos])) {
      pos++;
    }

    let attrValue = '';
    let quote = null;
    let valStart = null;
    let valEnd = null;
    let attrEnd = attrNameEnd;

    if (pos < len && source[pos] === '=') {
      pos++; // skip '='
      // Skip whitespace after '='
      while (pos < len && /\s/.test(source[pos])) {
        pos++;
      }

      if (pos < len) {
        const nextChar = source[pos];
        if (nextChar === '"' || nextChar === "'") {
          quote = nextChar;
          pos++; // skip opening quote
          valStart = pos;
          const quoteClose = source.indexOf(quote, pos);
          if (quoteClose === -1) {
            valEnd = len;
            attrValue = source.slice(pos);
            pos = len;
          } else {
            valEnd = quoteClose;
            attrValue = source.slice(pos, quoteClose);
            pos = quoteClose + 1; // skip closing quote
          }
          attrEnd = pos;
        } else {
          // Unquoted attribute value
          quote = null;
          valStart = pos;
          while (
            pos < len &&
            !/[\s>]/.test(source[pos]) &&
            !source.startsWith('/>', pos)
          ) {
            pos++;
          }
          valEnd = pos;
          attrValue = source.slice(valStart, valEnd);
          attrEnd = pos;
        }
      }
    } else {
      // Boolean attribute (no '=' following)
      pos = afterNamePos;
      attrValue = '';
      quote = null;
      attrEnd = attrNameEnd;
    }

    const rawAttr = source.slice(attrNameStart, attrEnd);

    attributes.push({
      name: attrName,
      value: attrValue,
      quote,
      raw: rawAttr,
      isMustache: false,
      startOffset: attrNameStart,
      endOffset: attrEnd,
      nameStartOffset: attrNameStart,
      nameEndOffset: attrNameEnd,
      valueStartOffset: valStart,
      valueEndOffset: valEnd,
      loc: {
        start: getLoc(attrNameStart),
        end: getLoc(attrEnd)
      }
    });
  }

  const endOffset = pos;
  const isVoid = VOID_ELEMENTS.has(tagName);

  return {
    type: TokenType.TAG_OPEN,
    tagName,
    rawTagName,
    attributes,
    selfClosing: selfClosing || isVoid,
    isVoid,
    raw: source.slice(startPos, endOffset),
    startOffset: startPos,
    endOffset,
    loc: {
      start: getLoc(startPos),
      end: getLoc(endOffset)
    }
  };
}
