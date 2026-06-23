import { decodeHtmlEntities, sanitizeProductDescription, stripHtml } from '@/lib/sanitize-html'
import { describe, expect, it } from 'vitest'

// Real shape of a WooCommerce->Square migrated description: real <p> tags
// wrapping entity-escaped inner markup (double-encoded).
const DOUBLE_ENCODED =
  '<p>&lt;p&gt;16 x 24-inch Acrylic Wall Art&lt;/p&gt;</p><p>&lt;p&gt;Artorias by Marios Dal&lt;/p&gt;</p>'

describe('sanitizeProductDescription', () => {
  it('keeps whitelisted tags', () => {
    const out = sanitizeProductDescription('<p>Hello <strong>world</strong></p>')
    expect(out).toContain('<p>')
    expect(out).toContain('<strong>')
  })

  it('strips <script>', () => {
    const out = sanitizeProductDescription('<p>safe</p><script>alert(1)</script>')
    expect(out).not.toMatch(/script/i)
  })

  it('strips <img>', () => {
    const out = sanitizeProductDescription('<p>x</p><img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/<img/)
  })

  it('strips <iframe>', () => {
    const out = sanitizeProductDescription('<iframe src="evil"></iframe><p>x</p>')
    expect(out).not.toMatch(/<iframe/)
  })

  it('strips inline event handlers from allowed tags', () => {
    const out = sanitizeProductDescription('<p onclick="boom">x</p>')
    expect(out).not.toMatch(/onclick/)
  })

  it('strips javascript: URLs from <a href>', () => {
    const out = sanitizeProductDescription('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
  })

  it('forces rel + target on <a>', () => {
    const out = sanitizeProductDescription('<a href="https://example.com">link</a>')
    expect(out).toMatch(/rel="noopener noreferrer"/)
    expect(out).toMatch(/target="_blank"/)
  })

  it('decodes double-encoded migrated descriptions to clean paragraphs', () => {
    const out = sanitizeProductDescription(DOUBLE_ENCODED)
    // The inner markup is now real, not visible text.
    expect(out).not.toMatch(/&lt;|&gt;/)
    expect(out).toContain('<p>16 x 24-inch Acrylic Wall Art</p>')
    expect(out).toContain('<p>Artorias by Marios Dal</p>')
    // No literal angle-bracket tags leak into the visible text.
    expect(out).not.toMatch(/&lt;p&gt;/)
    // The empty <p></p> from the collapsed nesting is dropped.
    expect(out).not.toMatch(/<p>\s*<\/p>/)
  })

  it('still strips scripts that were entity-escaped (decode happens before sanitize)', () => {
    const out = sanitizeProductDescription('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(out).not.toMatch(/script/i)
    expect(out).not.toMatch(/alert/)
  })

  it('does not over-decode legitimately single-encoded content', () => {
    // A clean description that escapes a literal ampersand should round-trip
    // safely (one decode level + re-sanitize), not collapse into raw markup.
    const out = sanitizeProductDescription('<p>Black &amp;amp; White</p>')
    expect(out).toContain('<p>')
    expect(out).not.toMatch(/script/i)
  })
})

describe('decodeHtmlEntities', () => {
  it('peels exactly one encoding layer', () => {
    expect(decodeHtmlEntities('&lt;p&gt;')).toBe('<p>')
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
  })

  it('handles numeric (decimal + hex) entities', () => {
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's")
    expect(decodeHtmlEntities('it&#x27;s')).toBe("it's")
  })

  it('leaves unknown entities untouched', () => {
    expect(decodeHtmlEntities('a&copy;b')).toBe('a&copy;b')
  })
})

describe('stripHtml', () => {
  it('returns plain text', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('returns empty string for null / undefined', () => {
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })

  it('strips script + their content', () => {
    expect(stripHtml('<p>safe</p><script>evil()</script>')).toBe('safe')
  })

  it('decodes migrated descriptions and spaces block boundaries (SEO meta)', () => {
    const out = stripHtml(DOUBLE_ENCODED)
    expect(out).not.toMatch(/[<>]|&lt;|&gt;/)
    // Adjacent lines are separated, not mashed ("Wall ArtArtorias").
    expect(out).toBe('16 x 24-inch Acrylic Wall Art Artorias by Marios Dal')
  })
})
