import { describe, expect, it } from 'vitest'
import { parseImdbCsv } from './importImdb'

const RATINGS_CSV = `Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0111161,9,2023-04-12,The Shawshank Redemption,https://imdb.com/title/tt0111161/,movie,9.3,142,1994,"Drama",2800000,1994-09-10,Frank Darabont
tt0903747,8,2023-05-01,"Breaking Bad",https://imdb.com/title/tt0903747/,TV Series,9.5,49,2008,"Crime, Drama",1900000,2008-01-20,
`

const WATCHLIST_CSV = `Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0133093,2024-01-05,2024-01-05,,The Matrix,https://imdb.com/title/tt0133093/,movie,8.7,136,1999,"Action, Sci-Fi",2000000,1999-03-31,"Lana Wachowski, Lilly Wachowski"
tt1520211,2024-01-06,2024-01-06,,The Walking Dead,https://imdb.com/title/tt1520211/,TV Series,8.1,44,2010,"Drama, Horror",1000000,2010-10-31,
tt7286456,2024-01-07,2024-01-07,,Joker,https://imdb.com/title/tt7286456/,movie,8.4,122,2019,"Crime, Drama",1500000,2019-10-04,Todd Phillips
`

const CHECKINS_CSV = `Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0111161,2024-02-10,2024-02-10,,The Shawshank Redemption,https://imdb.com/title/tt0111161/,movie,9.3,142,1994,Drama,2800000,1994-09-10,Frank Darabont
`

describe('parseImdbCsv', () => {
  it('parses ratings with native 1-10 scores, dates, imdb ids and media type', () => {
    const items = parseImdbCsv(RATINGS_CSV)
    expect(items).toEqual([
      { title: 'The Shawshank Redemption', mediaType: 'movie', imdbId: 'tt0111161', year: '1994', rating: 9, date: '2023-04-12' },
      { title: 'Breaking Bad', mediaType: 'tv', imdbId: 'tt0903747', year: '2008', rating: 8, date: '2023-05-01' }
    ])
  })

  it('parses watchlist rows with created dates for check-in style routing', () => {
    const items = parseImdbCsv(WATCHLIST_CSV)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ title: 'The Matrix', mediaType: 'movie', imdbId: 'tt0133093', year: '1999', watchedAt: '2024-01-05' })
    expect(items[1]).toMatchObject({ title: 'The Walking Dead', mediaType: 'tv' })
  })

  it('maps tv types to tv and skips video games', () => {
    const items = parseImdbCsv(`Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt1,2024-01-01,2024-01-01,,TV Special,https://x/,TV Special,8,60,2020,Doc,1,2020-01-01,
tt2,2024-01-01,2024-01-01,,Some Game,https://x/,Video Game,8,0,2020,Action,1,2020-01-01,
tt3,2024-01-01,2024-01-01,,TV Movie,https://x/,TV Movie,8,90,2020,Drama,1,2020-01-01,
`)
    expect(items.map((i) => [i.title, i.mediaType])).toEqual([
      ['TV Special', 'movie'],
      ['TV Movie', 'movie']
    ])
  })

  it('reads checkins rows as watched entries via the created date', () => {
    const items = parseImdbCsv(CHECKINS_CSV)
    expect(items).toEqual([
      { title: 'The Shawshank Redemption', mediaType: 'movie', imdbId: 'tt0111161', year: '1994', watchedAt: '2024-02-10' }
    ])
  })

  it('returns empty for non-imdb csvs and missing title column', () => {
    expect(parseImdbCsv('Date,Name,Year\n2024-01-01,X,2020\n')).toEqual([])
    expect(parseImdbCsv('Const,URL\ntt1,https://x/\n')).toEqual([])
    expect(parseImdbCsv('')).toEqual([])
  })
})
