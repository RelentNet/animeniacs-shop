import { sanitizeProductDescription, stripHtml } from '@/lib/sanitize-html'
import { describe, expect, it } from 'vitest'

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
})
