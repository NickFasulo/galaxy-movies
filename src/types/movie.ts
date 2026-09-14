export type MovieCategory = 'popular' | 'top_rated' | 'now_playing' | 'upcoming'

export interface Genre {
  id: number
  name: string
}

export interface ProductionCompany {
  id: number
  name: string
  logo_path?: string | null
}

export interface MovieVideo {
  id?: string
  key?: string | null
  type?: string | null
  official?: boolean | null
}

export interface Movie {
  id: number
  title?: string
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string
  tagline?: string
  vote_average?: number
  release_date?: string
  runtime?: number
  genres?: Genre[]
  production_companies?: ProductionCompany[]
  videos?: {
    results?: MovieVideo[]
  }
}

export interface MoviePageResponse {
  page: number
  total_pages?: number
  results?: Movie[]
}
