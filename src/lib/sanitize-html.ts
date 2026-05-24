import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a']
const ALLOWED_ATTR = ['href']

// Register the link-hardening hook once at module load. dompurify's
// hook registry is global across imports so this attaches once per
// process.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Sanitize a product description HTML string against the Decision 11
 * whitelist. Strips everything outside the allowlist. Forces every
 * surviving <a> to open in a new tab with rel="noopener noreferrer".
 */
export function sanitizeProductDescription(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false
  })
}

/**
 * Strip all tags from an HTML string. Used for SEO descriptions where
 * we need plain text.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
}
