import { describe, expect, it } from 'vitest'
import { parseTvTimeCsvs } from './importTvTime'

// Column layouts mirror the real GDPR export (trakt-web TvTimeGdprParser fixtures).
const FOLLOWED_CSV = `user_id,tv_show_id,notification_type,notification_offset,created_at,active,archived,tv_show_name
1,1399,2,1440,2020-01-01,1,0,Game of Thrones
1,953,2,1440,2020-02-01,0,1,Silent Show
`

const USER_DATA_CSV = `tv_show_id,tv_show_name,nb_episodes_seen,is_followed,is_favorited
1399,Game of Thrones,42,1,1
1396,Breaking Bad,62,1,0
`

const V2_CSV = `key,created_at,s_id,series_name,s_no,ep_no,ep_id,is_followed,is_for_later,is_archived
watch-episode-aaa,2021-01-01,1399,Game of Thrones,1,1,123,false,false,false
watch-episode-bbb,2021-01-02,1396,Breaking Bad,1,1,124,false,false,false
user-series-ccc,2020-01-01,1399,Game of Thrones,,,,true,false,false
user-series-ddd,2020-01-01,60735,The Flash,,,,false,true,false
user-series-eee,2020-01-01,99999,Old Show,,,,false,false,true
tracking-stats,,,,,,,,,
`

const V1_CSV = `type,entity_type,uuid,movie_name,release_date,alpha_range_key,series_id,series_name,season_number,episode_number,episode_id,watch_date
watch,movie,uu-watch,승리호,2021-02-05,watch-alpha-space-sweepers,,,,,
towatch,movie,uu-later,Dune,2021-10-22,towatch-alpha-dune,,,,,
watch,episode,uu-ep,,,,1399,Game of Thrones,1,1,123,2021-01-01
`

const RATINGS_CSV = `episode_id,movie_name,uuid,vote_key,user_id
0,승리호,uu-watch,uu-watch-36089951-3,36089951
0,,uu-missing,uu-missing-36089951-28,36089951
1331151,,uu-ep,uu-ep-36089951-29,36089951
0,Mystery,uu-bad,uu-bad-36089951-39,36089951
`

const SEEN_CSV = `tv_show_id,tv_show_name,episode_season_number,episode_number,created_at
60735,The Flash,9,10,2022-01-01
`

describe('parseTvTimeCsvs', () => {
  it('imports followed shows to the watchlist with tvdb ids and skips archived', () => {
    const result = parseTvTimeCsvs([{ name: 'followed_tv_show.csv', text: FOLLOWED_CSV }])
    expect(result.watchlist).toEqual([{ title: 'Game of Thrones', tvdbId: 1399, mediaType: 'tv' }])
    expect(result.filesRead).toEqual(['followed_tv_show.csv'])
  })

  it('maps v2 user-series flags and counts watched-only shows as skipped', () => {
    const result = parseTvTimeCsvs([{ name: 'tracking-prod-records-v2.csv', text: V2_CSV }])
    expect(result.watchlist).toEqual([
      { title: 'Game of Thrones', tvdbId: 1399, mediaType: 'tv' },
      { title: 'The Flash', tvdbId: 60735, mediaType: 'tv' }
    ])
    // Breaking Bad only has watch-episode rows: nothing to put it in.
    expect(result.skippedWatched).toBe(1)
  })

  it('maps v1 movies: towatch to watchlist, watch to skipped, english slug preferred', () => {
    const result = parseTvTimeCsvs([{ name: 'tracking-prod-records.csv', text: V1_CSV }])
    expect(result.watchlist).toEqual([{ title: 'dune', year: '2021', mediaType: 'movie' }])
    // 승리호 was watched without a rating; Game of Thrones ep watch row also counts.
    expect(result.skippedWatched).toBe(2)
  })

  it('maps scalev2 vote ids to 1-10 ratings and recovers english titles via uuid join', () => {
    const result = parseTvTimeCsvs([
      { name: 'ratings-live-votes.csv', text: RATINGS_CSV },
      { name: 'tracking-prod-records.csv', text: V1_CSV }
    ])
    expect(result.ratings).toEqual([
      { title: 'space sweepers', year: '2021', mediaType: 'movie', rating: 10 }
    ])
    // A rated watched movie is no longer counted as skipped; the show ep row stays.
    expect(result.skippedWatched).toBe(1)
    expect(result.watchlist).toEqual([{ title: 'dune', year: '2021', mediaType: 'movie' }])
  })

  it('keeps a rated movie out of the watchlist even with a towatch row', () => {
    const v1 = V1_CSV.replace('towatch,movie,uu-later,Dune,2021-10-22,towatch-alpha-dune', 'towatch,movie,uu-later,승리호,2021-02-05,towatch-alpha-space-sweepers')
    const result = parseTvTimeCsvs([
      { name: 'ratings-live-votes.csv', text: RATINGS_CSV },
      { name: 'tracking-prod-records.csv', text: v1 }
    ])
    expect(result.watchlist).toEqual([])
    expect(result.ratings).toHaveLength(1)
  })

  it('reads seen-episode files as skipped watched shows and counts ignored files', () => {
    const result = parseTvTimeCsvs([
      { name: 'watched_on_episode.csv', text: SEEN_CSV },
      { name: 'user.csv', text: 'id,email\n1,x@y.z' },
      { name: 'emotions-live-votes.csv', text: RATINGS_CSV }
    ])
    expect(result.skippedWatched).toBe(1)
    expect(result.filesRead).toEqual(['watched_on_episode.csv'])
    expect(result.filesIgnored).toBe(2)
    expect(result.ratings).toEqual([])
  })

  it('dedupes a show followed in both csv files and keeps user_tv_show_data follows', () => {
    const result = parseTvTimeCsvs([
      { name: 'followed_tv_show.csv', text: FOLLOWED_CSV },
      { name: 'user_tv_show_data.csv', text: USER_DATA_CSV }
    ])
    expect(result.watchlist).toEqual([
      { title: 'Game of Thrones', tvdbId: 1399, mediaType: 'tv' },
      { title: 'Breaking Bad', tvdbId: 1396, mediaType: 'tv' }
    ])
  })
})
