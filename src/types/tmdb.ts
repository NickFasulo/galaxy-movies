export type MediaType = 'movie' | 'tv'

export interface Genre {
  id: number
  name: string
}

export interface TmdbPaged<T> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export interface TmdbMovie {
  id: number
  title: string
  original_title?: string
  overview?: string
  poster_path: string | null
  backdrop_path?: string | null
  release_date?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  genre_ids?: number[]
  original_language?: string
  adult?: boolean
}

export interface TmdbTvShow {
  id: number
  name: string
  original_name?: string
  overview?: string
  poster_path: string | null
  backdrop_path?: string | null
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  genre_ids?: number[]
  origin_country?: string[]
  original_language?: string
}

export type NormalizedTvShow = TmdbTvShow & {
  title: string
  release_date?: string
  mediaType: 'tv'
}

// Loose card/grid shape: movies, normalized tv shows, multi-search results and
// watchlist entries all flow through the same components.
export interface TitleSummary {
  id: number
  title?: string
  name?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  overview?: string
  genre_ids?: number[]
  mediaType?: MediaType
  media_type?: string
}

export interface ProductionCompany {
  id: number
  name: string
  logo_path: string | null
  origin_country?: string
}

export interface Video {
  id?: string
  key: string
  name?: string
  site?: string
  type: string
  official?: boolean
}

export interface TmdbMovieDetails extends TmdbMovie {
  genres?: Genre[]
  runtime?: number | null
  tagline?: string | null
  status?: string
  budget?: number
  revenue?: number
  imdb_id?: string | null
  homepage?: string | null
  production_companies?: ProductionCompany[]
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null
  videos?: { results: Video[] }
}

export interface TvCreator {
  id: number
  name: string
  profile_path?: string | null
}

export interface TmdbTvDetails extends TmdbTvShow {
  genres?: Genre[]
  tagline?: string | null
  status?: string
  last_air_date?: string | null
  number_of_seasons?: number
  number_of_episodes?: number
  episode_run_time?: number[]
  created_by?: TvCreator[]
  networks?: ProductionCompany[]
  production_companies?: ProductionCompany[]
  homepage?: string | null
  videos?: { results: Video[] }
}

export interface CastMember {
  id: number
  name: string
  character?: string
  profile_path: string | null
  order?: number
}

export interface CrewMember {
  id: number
  name: string
  job: string
  department?: string
  profile_path?: string | null
}

export interface Credits {
  cast: CastMember[]
  crew: CrewMember[]
}

export interface AggregateCastMember {
  id: number
  name: string
  profile_path: string | null
  roles?: { character: string; episode_count?: number }[]
  total_episode_count?: number
}

export interface AggregateCredits {
  cast: AggregateCastMember[]
  crew: (CrewMember & { jobs?: { job: string }[] })[]
}

export interface WatchProvider {
  provider_id: number
  provider_name: string
  logo_path: string
  display_priority?: number
}

export interface WatchProvidersRegion {
  link?: string
  flatrate?: WatchProvider[]
  rent?: WatchProvider[]
  buy?: WatchProvider[]
  ads?: WatchProvider[]
  free?: WatchProvider[]
}

export interface WatchProvidersResponse {
  id?: number
  results?: Record<string, WatchProvidersRegion>
}

export interface ReleaseDatesResponse {
  results?: {
    iso_3166_1: string
    release_dates?: { certification?: string; type?: number; release_date?: string }[]
  }[]
}

export interface ContentRatingsResponse {
  results?: { iso_3166_1: string; rating?: string }[]
}

export interface TmdbCollection {
  id: number
  name: string
  overview?: string
  poster_path: string | null
  backdrop_path: string | null
  parts?: TmdbMovie[]
}

export type MovieCredit = TmdbMovie & {
  character?: string
  job?: string
  credit_id?: string
}

export type TvCredit = TmdbTvShow & {
  character?: string
  job?: string
  roles?: { character: string }[]
  jobs?: { job: string }[]
  credit_id?: string
  episode_count?: number
}

export interface TmdbPerson {
  id: number
  name: string
  biography?: string
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  profile_path: string | null
  known_for_department?: string
  also_known_as?: string[]
  movie_credits?: { cast?: MovieCredit[]; crew?: MovieCredit[] }
  tv_credits?: { cast?: TvCredit[]; crew?: TvCredit[] }
}

export interface TmdbCompany {
  id: number
  name: string
  description?: string
  headquarters?: string
  homepage?: string
  logo_path: string | null
  origin_country?: string
  parent_company?: { id: number; name: string; logo_path: string | null } | null
}

export type TmdbNetwork = TmdbCompany
