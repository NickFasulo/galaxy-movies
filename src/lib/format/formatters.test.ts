import { describe, expect, it } from 'vitest'
import { dateFormatter } from './formatters'
import { timeFormatter } from './formatters'
import { removeUnderscores } from './formatters'
import { shortDate } from './formatters'

describe('dateFormatter', () => {
  it('formats a date as "Mon d, yyyy"', () => {
    expect(dateFormatter('2024-06-15')).toBe('Jun 15, 2024')
  })
})

describe('timeFormatter', () => {
  it('formats hours and minutes', () => {
    expect(timeFormatter(135)).toBe('2h 15m')
    expect(timeFormatter(45)).toBe('0h 45m')
  })

  it('omits minutes when the runtime is a whole hour', () => {
    expect(timeFormatter(120)).toBe('2h')
  })
})

describe('shortDate', () => {
  it.each([
    ['2026-10-31', 'Oct 31'],
    ['20260105', 'Jan 5'],
    ['2024-02-29', 'Feb 29']
  ])('formats %s as %s', (stamp, expected) => {
    expect(shortDate(stamp)).toBe(expected)
  })

  it.each([null, undefined, '', 'not-a-date', '2024-13-40x'])(
    'returns the fallback for unparseable input %j',
    (stamp) => {
      expect(shortDate(stamp)).toBe('')
      expect(shortDate(stamp, 'raw')).toBe('raw')
    }
  )
})

describe('removeUnderscores', () => {
  it('title-cases underscore-separated words', () => {
    expect(removeUnderscores('best_movies_2024')).toBe('Best Movies 2024')
    expect(removeUnderscores('single')).toBe('Single')
  })
})
