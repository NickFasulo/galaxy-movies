import { describe, expect, it } from 'vitest'
import { buildTelegramText } from './telegram'
import type { MatchedItem } from './watchlistAlerts'

const item: MatchedItem = {
  kind: 'added',
  notifiedKey: 'added:movie:1@netflix',
  tmdbId: 1,
  tmdbType: 'movie',
  title: 'Some Film',
  provider: 'Netflix'
}

describe('buildTelegramText', () => {
  it('renders markdown links and a status line', () => {
    const text = buildTelegramText([item])
    expect(text).toContain('[Some Film](https://www.galaxymovies.app/movies/1)')
    expect(text).toContain('Now on Netflix')
    expect(text).toContain('*Something on your list just moved*')
  })

  it('escapes legacy markdown characters in titles', () => {
    const text = buildTelegramText([{ ...item, title: 'A_Film *With* [Brackets]' }])
    expect(text).toContain('A\\_Film \\*With\\* \\[Brackets]')
    expect(text).not.toContain('A_Film *With*')
  })

  it('renders coming and taste status lines', () => {
    const coming: MatchedItem = { ...item, kind: 'coming', date: '20260115', season: 2 }
    const taste: MatchedItem = { ...item, kind: 'taste', via: 'Inception' }
    const text = buildTelegramText([coming, taste])
    expect(text).toContain('Coming to Netflix, Jan 15, season 2')
    expect(text).toContain('because you rated Inception highly')
  })
})
