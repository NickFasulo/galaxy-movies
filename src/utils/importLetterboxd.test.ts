import { describe, expect, it } from 'vitest'
import { parseLetterboxdCsv } from './importLetterboxd'

const WATCHLIST_CSV = `Date,Name,Year,Letterboxd URI
2024-01-05,The Matrix,1999,https://letterboxd.com/film/the-matrix/
2024-01-06,"The Good, the Bad and the Ugly",1966,https://letterboxd.com/film/the-good-the-bad-and-the-ugly/
`

const RATINGS_CSV = `Date,Name,Year,Letterboxd URI,Rating
2024-02-01,Heat,1995,https://letterboxd.com/film/heat-1995/,4.5
2024-02-02,"He said ""Hi""",2001,https://letterboxd.com/film/x/,0.5
2024-02-03,Unrated Title,2020,https://letterboxd.com/film/y/,
`

describe('parseLetterboxdCsv', () => {
  it('parses a watchlist export with quoted comma titles', () => {
    const items = parseLetterboxdCsv(WATCHLIST_CSV)
    expect(items).toEqual([
      { title: 'The Matrix', year: '1999' },
      { title: 'The Good, the Bad and the Ugly', year: '1966' }
    ])
  })

  it('maps half-star ratings to the 1–10 scale and skips empty ratings', () => {
    const items = parseLetterboxdCsv(RATINGS_CSV)
    expect(items).toEqual([
      { title: 'Heat', year: '1995', rating: 9 },
      { title: 'He said "Hi"', year: '2001', rating: 1 },
      { title: 'Unrated Title', year: '2020' }
    ])
  })

  it('handles CRLF, BOM, and missing year column', () => {
    const items = parseLetterboxdCsv('﻿Name,Letterboxd URI\r\nSolo Title,https://x/\r\n')
    expect(items).toEqual([{ title: 'Solo Title' }])
  })

  it('returns empty for a non-Letterboxd csv', () => {
    expect(parseLetterboxdCsv('foo,bar\n1,2\n')).toEqual([])
    expect(parseLetterboxdCsv('')).toEqual([])
  })
})
