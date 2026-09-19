/**
 * fix11y - Shared Accessible Naming & Semantic Detection Engine.
 * Invariant 1: Strictly zero external dependencies (Node standard library only).
 * Provides meaningful-image classification, context-aware accessible name derivation,
 * and generic placeholder blocklist enforcement across all core rules.
 */

import {
  getAttributeValue,
  hasAttribute,
  getTextContent,
  findNodes
} from '../parser/parser.js';

/**
 * Hard blocklist of generic / anti-pattern placeholders that must never be emitted as accessible names.
 */
export const GENERIC_LABEL_BLOCKLIST = new Set([
  'action',
  'button',
  'btn',
  'click',
  'click here',
  'here',
  'link',
  'image',
  'img',
  'picture',
  'photo',
  'icon',
  'graphic',
  'item',
  'element',
  'content',
  'go',
  'input',
  'input field',
  'field'
]);

/**
 * Checks if a candidate label matches the generic blocklist in a given context.
 * @param {string|null|undefined} name
 * @param {{ type?: 'image'|'button'|'link'|'input' }} [context]
 * @returns {boolean}
 */
export function isBlocklisted(name, context = {}) {
  if (!name || typeof name !== 'string') return true;
  const normalized = name.toLowerCase().trim();
  if (normalized.length === 0) return true;

  if (GENERIC_LABEL_BLOCKLIST.has(normalized)) return true;

  // Context-specific: 'submit' is blocklisted for <img> (an image is not a submit control)
  if (context.type === 'image' && normalized === 'submit') {
    return true;
  }

  return false;
}

/**
 * Curated meaningful tokens (checked first, taking strict precedence over decorative).
 */
const MEANINGFUL_TOKENS = [
  'logo', 'brand', 'emblem', 'badge', 'masthead', 'trademark',
  'chart', 'graph', 'diagram', 'flow', 'infographic', 'map', 'schematic',
  'avatar', 'profile', 'user', 'author', 'product', 'hero', 'banner', 'illustration'
];

/**
 * Curated decorative tokens (checked only if zero meaningful signals matched).
 */
const DECORATIVE_TOKENS = [
  'spacer', 'divider', 'border', 'bg', 'background', 'pattern',
  'bullet', 'decoration', 'decorative'
];

/**
 * Comprehensive UI intent vocabulary mapping common identifiers to accessible names.
 */
const VOCABULARY_MAP = {
  notification: 'Notifications',
  notifications: 'Notifications',
  bell: 'Notifications',
  alert: 'Notifications',
  alerts: 'Notifications',
  notice: 'Notifications',
  logo: 'Logo',
  brand: 'Logo',
  settings: 'Settings',
  gear: 'Settings',
  cog: 'Settings',
  options: 'Settings',
  preferences: 'Settings',
  search: 'Search',
  magnifier: 'Search',
  lookup: 'Search',
  menu: 'Menu',
  hamburger: 'Menu',
  drawer: 'Menu',
  close: 'Close',
  dismiss: 'Close',
  cancel: 'Close',
  cross: 'Close',
  cart: 'Shopping Cart',
  basket: 'Shopping Cart',
  bag: 'Shopping Cart',
  user: 'User Profile',
  account: 'User Profile',
  profile: 'User Profile',
  avatar: 'User Profile',
  help: 'Help',
  question: 'Help',
  info: 'Help',
  filter: 'Filter',
  sort: 'Sort',
  funnel: 'Filter',
  next: 'Next',
  forward: 'Next',
  prev: 'Previous',
  previous: 'Previous',
  back: 'Previous',
  delete: 'Delete',
  trash: 'Delete',
  remove: 'Delete',
  bin: 'Delete',
  edit: 'Edit',
  pencil: 'Edit',
  modify: 'Edit',
  submit: 'Submit',
  save: 'Save',
  download: 'Download',
  upload: 'Upload',
  share: 'Share',
  refresh: 'Refresh',
  reload: 'Refresh',
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  home: 'Home'
};

/**
 * Humanizes an identifier string (kebab-case, snake_case, camelCase) into readable words.
 * @param {string} str
 * @returns {string}
 */
export function humanizeIdentifier(str) {
  if (!str || typeof str !== 'string') return '';
  const cleaned = str
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .replace(/(?:^|\b)(?:btn|icon|nav|js|app)[-_]+/gi, '')
    .replace(/[-_]+(?:btn|icon|button)\b/gi, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Tri-state image classifier implementing the General Precedence Invariant:
 * Meaningful signals strictly override decorative signals.
 * @param {object} node CST element node (<img>)
 * @param {object|null} [parentNode] Parent CST element node
 * @returns {'meaningful' | 'decorative' | 'unknown'}
 */
export function classifyImage(node, parentNode = null) {
  if (!node || node.type !== 'element' || node.tagName !== 'img') {
    return 'unknown';
  }

  const parent = parentNode || node.parent;

  // Extract inspection strings
  const src = (getAttributeValue(node, 'src') || '').toLowerCase();
  const cls = (getAttributeValue(node, 'class') || '').toLowerCase();
  const id = (getAttributeValue(node, 'id') || '').toLowerCase();
  const combined = `${src} ${cls} ${id}`;

  // -------------------------------------------------------------------------
  // STEP 1: Meaningful Signal Evaluation (Strict Priority)
  // -------------------------------------------------------------------------

  // 1.1 Curated meaningful tokens in src, class, or id
  for (const token of MEANINGFUL_TOKENS) {
    // Word boundary or separator match
    const regex = new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`);
    if (regex.test(combined)) {
      return 'meaningful';
    }
  }

  // 1.2 Interactive role: Sole child of an <a> or <button>
  if (parent && parent.type === 'element' && ['a', 'button'].includes(parent.tagName)) {
    const siblings = (parent.children || []).filter(
      (c) => c.type === 'element' || (c.type === 'text' && c.value.trim().length > 0)
    );
    if (siblings.length === 1 && siblings[0] === node) {
      return 'meaningful';
    }
  }

  // 1.3 Explanatory markup presence
  if (hasAttribute(node, 'data-caption') || hasAttribute(node, 'longdesc')) {
    return 'meaningful';
  }
  if (parent && parent.type === 'element' && parent.tagName === 'figure') {
    const hasFigcaption = (parent.children || []).some(
      (c) => c.type === 'element' && c.tagName === 'figcaption'
    );
    if (hasFigcaption) {
      return 'meaningful';
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Decorative Signal Evaluation (Only if Step 1 returned 0 matches)
  // -------------------------------------------------------------------------

  // 2.1 Explicit presentation roles
  const role = (getAttributeValue(node, 'role') || '').toLowerCase();
  if (role === 'presentation' || role === 'none') {
    return 'decorative';
  }

  // 2.2 Curated decorative tokens
  for (const token of DECORATIVE_TOKENS) {
    const regex = new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`);
    if (regex.test(combined)) {
      return 'decorative';
    }
  }

  // 2.3 Sibling text redundancy inside same immediate parent
  if (parent && parent.type === 'element') {
    const textSiblings = (parent.children || []).filter(
      (c) => c !== node && ((c.type === 'text' && c.value.trim().length > 0) || (c.type === 'element' && getTextContent(c).trim().length > 0))
    );
    if (textSiblings.length > 0) {
      // If the image has an explicit icon indicator and is paired with visible text
      if (/(?:^|[^a-z0-9])icon(?:[^a-z0-9]|$)/.test(combined)) {
        return 'decorative';
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3: Unknown Fallback (Critical General Case)
  // -------------------------------------------------------------------------
  return 'unknown';
}

/**
 * Derives a human-readable accessible name from element attributes and CST context.
 * Returns null if no non-blocklisted name can be determined with confidence.
 * @param {object} node CST element node
 * @param {{ type?: 'image'|'button'|'link'|'input' }} [options]
 * @returns {string|null}
 */
export function deriveAccessibleName(node, options = {}) {
  if (!node || node.type !== 'element') return null;

  const type = options.type || node.tagName;

  // 1. Explicit title attribute
  const title = (getAttributeValue(node, 'title') || '').trim();
  if (title && !isBlocklisted(title, options)) {
    return title;
  }

  // 2. Form control placeholders
  if (type === 'input') {
    const placeholder = (getAttributeValue(node, 'placeholder') || '').trim();
    if (placeholder && !isBlocklisted(placeholder, options)) {
      return placeholder;
    }
  }

  // 3. Inner SVG child cues (<title>, <use href="#icon-bell">, classes)
  const svgs = findNodes(node, (n) => n.type === 'element' && n.tagName === 'svg');
  for (const svg of svgs) {
    // 3a. <svg><title>
    const svgTitles = findNodes(svg, (n) => n.type === 'element' && n.tagName === 'title');
    for (const st of svgTitles) {
      const text = getTextContent(st).trim();
      if (text && !isBlocklisted(text, options)) {
        return text;
      }
    }

    // 3b. <use href="#icon-bell">
    const uses = findNodes(svg, (n) => n.type === 'element' && n.tagName === 'use');
    for (const u of uses) {
      const href = getAttributeValue(u, 'href') || getAttributeValue(u, 'xlink:href') || '';
      const symbolId = href.replace(/^#/, '').toLowerCase();
      for (const [key, val] of Object.entries(VOCABULARY_MAP)) {
        if (symbolId.includes(key)) {
          if (!isBlocklisted(val, options)) return val;
        }
      }
    }

    // 3c. SVG class names
    const svgCls = (getAttributeValue(svg, 'class') || '').toLowerCase();
    for (const [key, val] of Object.entries(VOCABULARY_MAP)) {
      const regex = new RegExp(`(?:^|[^a-z0-9])${key}(?:[^a-z0-9]|$)`);
      if (regex.test(svgCls)) {
        if (!isBlocklisted(val, options)) return val;
      }
    }
  }

  // 4. Nested icon <i> or <span> classes
  const iconElements = findNodes(node, (n) => n.type === 'element' && ['i', 'span'].includes(n.tagName));
  for (const icon of iconElements) {
    const iconCls = (getAttributeValue(icon, 'class') || '').toLowerCase();
    for (const [key, val] of Object.entries(VOCABULARY_MAP)) {
      const regex = new RegExp(`(?:^|[^a-z0-9])${key}(?:[^a-z0-9]|$)`);
      if (regex.test(iconCls)) {
        if (!isBlocklisted(val, options)) return val;
      }
    }
  }

  // 5. Element class, id, onclick, and data attributes vocabulary matching
  const cls = getAttributeValue(node, 'class') || '';
  const id = getAttributeValue(node, 'id') || '';
  const nameAttr = getAttributeValue(node, 'name') || '';
  const onclick = getAttributeValue(node, 'onclick') || '';
  const dataAction = getAttributeValue(node, 'data-action') || '';
  const ariaControls = getAttributeValue(node, 'aria-controls') || '';

  const rawCombined = `${cls} ${id} ${nameAttr} ${onclick} ${dataAction} ${ariaControls}`
    .replace(/\{\{.*?\}\}/g, ' ');
  const humanizedCombined = humanizeIdentifier(rawCombined).toLowerCase();
  const combinedIdent = `${rawCombined.toLowerCase()} ${humanizedCombined}`;

  for (const [key, val] of Object.entries(VOCABULARY_MAP)) {
    const regex = new RegExp(`(?:^|[^a-z0-9])${key}(?:[^a-z0-9]|$)`);
    if (regex.test(combinedIdent)) {
      if (!isBlocklisted(val, options)) return val;
    }
  }

  // 6. Image source filename inspection (for images or controls containing sole image)
  let imgNode = node.tagName === 'img' ? node : null;
  if (!imgNode) {
    const imgs = findNodes(node, (n) => n.type === 'element' && n.tagName === 'img');
    if (imgs.length === 1) imgNode = imgs[0];
  }

  if (imgNode) {
    const imgSrc = (getAttributeValue(imgNode, 'src') || '').toLowerCase();
    for (const [key, val] of Object.entries(VOCABULARY_MAP)) {
      const regex = new RegExp(`(?:^|[^a-z0-9])${key}(?:[^a-z0-9]|$)`);
      if (regex.test(imgSrc)) {
        if (!isBlocklisted(val, options)) return val;
      }
    }

    // Try extracting clean filename basename
    try {
      const filename = imgSrc.split('/').pop()?.split('?')[0]?.replace(/\.[a-z0-9]+$/i, '');
      if (filename) {
        const humanized = humanizeIdentifier(filename);
        if (humanized && !isBlocklisted(humanized, options)) {
          return humanized.charAt(0).toUpperCase() + humanized.slice(1);
        }
      }
    } catch {
      // Ignore URL parsing failure
    }
  }

  // 7. Link href inspection (for <a> links)
  if (node.tagName === 'a') {
    const href = (getAttributeValue(node, 'href') || '').trim();

    if (href === '/' || href === '/home') {
      return 'Home';
    }

    if (href.startsWith('mailto:')) {
      const email = href.slice(7).split('?')[0].trim();
      if (email && !isBlocklisted(email, options)) return `Email ${email}`;
    }

    if (href.startsWith('tel:')) {
      const phone = href.slice(4).trim();
      if (phone && !isBlocklisted(phone, options)) return `Call ${phone}`;
    }

    if (href.startsWith('#') && href.length > 1) {
      const target = humanizeIdentifier(href.slice(1));
      if (target && !isBlocklisted(target, options)) return `Go to ${target}`;
    }

    try {
      const url = new URL(href, 'https://example.com');
      const pathname = url.pathname.replace(/^\/|\/$/g, '');
      if (pathname) {
        const segment = pathname.split('/').pop();
        if (segment) {
          const humanized = humanizeIdentifier(segment.replace(/\.[a-z0-9]+$/i, ''));
          if (humanized && !isBlocklisted(humanized, options)) {
            return humanized.charAt(0).toUpperCase() + humanized.slice(1);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 8. Humanize name attribute (for input controls)
  if (nameAttr) {
    const humanized = humanizeIdentifier(nameAttr);
    if (humanized && !isBlocklisted(humanized, options)) {
      return humanized.charAt(0).toUpperCase() + humanized.slice(1);
    }
  }

  // 9. Legitimate submit buttons (<button type="submit">)
  if (node.tagName === 'button' && getAttributeValue(node, 'type') === 'submit') {
    return 'Submit';
  }

  // If all sources produced empty or blocklisted candidates, return null
  return null;
}
