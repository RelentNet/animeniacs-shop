import { getContent, listContent } from '@/lib/content'
import { describe, expect, it } from 'vitest'

describe('content loader', () => {
  it('lists all 12 static content pages', () => {
    const entries = listContent()
    expect(entries.length).toBe(12)
  })

  it('finds the about-us page', () => {
    const entry = getContent('about-us')
    expect(entry).not.toBeNull()
    expect(entry?.title).toBe('About Us')
    expect(entry?.html).toContain('Animeniacs')
  })

  it('returns null for unknown slug', () => {
    expect(getContent('nope-not-real')).toBeNull()
  })

  it('about-us html contains expected content', () => {
    const entry = getContent('about-us')
    expect(entry?.html).toContain('New Orleans')
  })
})
