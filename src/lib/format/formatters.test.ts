import { describe, expect, it } from 'vitest'
import dateFormatter from './dateFormatter'
import timeFormatter from './timeFormatter'
import removeUnderscores from './removeUnderscores'

describe('dateFormatter', () => {
  it('formats a date as "Mon d, yyyy"', () => {
    expect(dateFormatter(new Date(2024, 5, 15))).toBe('Jun 15, 2024')
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

describe('removeUnderscores', () => {
  it('title-cases underscore-separated words', () => {
    expect(removeUnderscores('best_movies_2024')).toBe('Best Movies 2024')
    expect(removeUnderscores('single')).toBe('Single')
  })
})
