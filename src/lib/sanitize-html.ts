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

// The small set of named entities that actually appear in the catalog data.
// Anything outside this set (and outside the numeric forms handled below) is
// left intact rather than guessed at.
const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

/**
 * Decode HTML entities ONE level. Square product descriptions migrated from
 * WooCommerce are double-encoded — real `<p>` tags wrapping entity-escaped
 * inner markup, e.g. `<p>&lt;p&gt;16 x 24-inch&lt;/p&gt;</p>` — so without this
 * the inner `<p>` shows on screen as literal text. A single regex pass (the
 * global replace never re-scans inserted text) peels exactly one encoding
 * layer, so `&amp;lt;` → `&lt;` rather than over-decoding legitimately
 * single-encoded content. Pure string work, so it's safe in a server context.
 *
 * IMPORTANT: callers must sanitize AFTER decoding — decoding first means an
 * escaped `&lt;script&gt;` becomes a real `<script>` that DOMPurify then strips.
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (match, body: string) => {
    const token = body.toLowerCase()
    if (token[0] === '#') {
      const code =
        token[1] === 'x' ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10)
      if (Number.isNaN(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, token)
      ? NAMED_ENTITIES[token]
      : match
  })
}

/**
 * Sanitize a product description HTML string against the Decision 11
 * whitelist. Decodes one entity layer first (see decodeHtmlEntities), strips
 * everything outside the allowlist, drops the empty `<p></p>` the migration's
 * nested `<p><p>…</p></p>` collapses into, and forces every surviving <a> to
 * open in a new tab with rel="noopener noreferrer".
 */
export function sanitizeProductDescription(html: string): string {
  const decoded = decodeHtmlEntities(html)
  const clean = DOMPurify.sanitize(decoded, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false
  })
  return clean.replace(/<p>\s*<\/p>/gi, '')
}

/**
 * Strip all tags from an HTML string. Used for SEO descriptions where
 * we need plain text. Decodes one entity layer first so migrated
 * descriptions don't leak literal tags into the meta description, and turns
 * block boundaries into spaces so adjacent lines don't mash together
 * ("Wall ArtTitle by Artist").
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  const decoded = decodeHtmlEntities(html).replace(/<\/(p|li|h[1-6])>|<br\s*\/?>/gi, ' ')
  return DOMPurify.sanitize(decoded, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, ' ')
    .trim()
}
