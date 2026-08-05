import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'span', 'div', 'blockquote', 'pre', 'code',
  'img',
];

const ALLOWED_ATTRS = [
  'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
  'class', 'colspan', 'rowspan', 'align', 'valign',
];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    if (node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
    const href = node.getAttribute('href') || '';
    if (href.startsWith('javascript:') || href.startsWith('data:')) {
      node.removeAttribute('href');
    }
  }
});

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_DATA_ATTR: false,
  });
}
