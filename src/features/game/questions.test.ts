import { describe, expect, it } from 'vitest'
import { buildDailyQuestions } from './questions'
import type { CatalogTitle, ProviderChanges } from '../catalog/streamingChanges'

const catalog = (provider: string, prefix = ''): CatalogTitle[] =>
  Array.from({ length: 60 }, (_, i) => ({
    tmdbId: i + 1,
    tmdbType: 'movie' as const,
    title: `${prefix}${provider} Title ${i}`,
    year: 2000 + (i % 25)
  }))

const change = (added: string[], left: string[], coming: string[] = []): ProviderChanges => ({
  source: 'test',
  updatedAt: Date.now(),
  added: added.map((title, i) => ({ tmdbId: 9000 + i, tmdbType: 'movie', title, year: 2020 })),
  left: left.map((title, i) => ({ tmdbId: 9500 + i, tmdbType: 'movie', title, year: 2020 })),
  coming: coming.map((title, i) => ({ tmdbId: 9800 + i, tmdbType: 'movie', title, year: 2020, date: '2026-10-25', season: null }))
})

const FIXTURE = {
  changes: {
    netflix: change(['Fresh Hit'], ['Gone Tomorrow'], ['Soon Film']),
    hulu: change(['Hulu Newcomer'], ['Departed Classic'], ['Upcoming Show'])
  },
  catalogs: {
    netflix: catalog('Netflix'),
    hulu: catalog('Hulu'),
    'disney-plus': catalog('Disney')
  }
}

describe('buildDailyQuestions', () => {
  it('is deterministic for a given date', () => {
    const a = buildDailyQuestions(FIXTURE.changes, FIXTURE.catalogs, '2026-10-19')
    const b = buildDailyQuestions(FIXTURE.changes, FIXTURE.catalogs, '2026-10-19')
    expect(a).toEqual(b)
  })

  it('produces valid question shape', () => {
    const qs = buildDailyQuestions(FIXTURE.changes, FIXTURE.catalogs, '2026-10-19')
    expect(qs.length).toBeGreaterThanOrEqual(2)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.answerIndex).toBeGreaterThanOrEqual(0)
      expect(q.answerIndex).toBeLessThan(4)
      expect(q.options[q.answerIndex]).toBeTruthy()
      expect(q.link).toMatch(/^https/)
    }
  })

  it('answers diff questions with real change events', () => {
    const qs = buildDailyQuestions(FIXTURE.changes, FIXTURE.catalogs, '2026-10-19')
    const texts = new Set(['Fresh Hit', 'Gone Tomorrow', 'Soon Film', 'Hulu Newcomer', 'Departed Classic', 'Upcoming Show'])
    const diffQs = qs.filter((q) => /left|arrived|coming/.test(q.prompt))
    for (const q of diffQs) {
      expect(texts.has(q.options[q.answerIndex])).toBe(true)
      // distractors must not be actual diff titles
      q.options.forEach((o, i) => {
        if (i !== q.answerIndex) expect(texts.has(o)).toBe(false)
      })
    }
  })

  it('varies across dates', () => {
    const a = buildDailyQuestions(FIXTURE.changes, FIXTURE.catalogs, '2026-10-19')
    const b = buildDailyQuestions(FIXTURE.changes, FIXTURE.catalogs, '2026-10-20')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})
