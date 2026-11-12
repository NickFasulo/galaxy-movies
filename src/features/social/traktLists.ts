import { BROADCAST_PROVIDERS, providerLabel } from './socialBroadcast'
import {
  getMonthlyChanges,
  getProviderChanges,
  type CatalogTitle,
  type DatedCatalogTitle,
  type LeavingSoonTitle
} from '../catalog/streamingChanges'
import { SITE_URL } from '../../lib/site'

// api.trakt.tv's Cloudflare edge rate-limits datacenter egress (workerd 429s,
// GH Actions 403s) — the Trakt writes happen in scripts/trakt-lists-sync.js on
// a residential connection. This builds the desired list contents; the cron
// route serves them to that script.
const LIST_CAP = 50
const LIST_DESC = `Auto-updated from Galaxy Movies — ${SITE_URL}/leaving`

type ListableTitle = Pick<CatalogTitle, 'tmdbId' | 'tmdbType' | 'popularity'>

export interface TraktListContent {
  name: string
  description: string
  movies: number[]
  shows: number[]
}

export interface TraktListsPlan {
  lists: TraktListContent[]
  skipped: string[]
}

const pickTop = <T extends ListableTitle>(titles: T[]): T[] =>
  [...titles].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, LIST_CAP)

const dedupe = <T extends ListableTitle>(titles: T[]): T[] => {
  const seen = new Set<string>()
  return titles.filter((t) => {
    const key = `${t.tmdbType}:${t.tmdbId}`
    if (typeof t.tmdbId !== 'number' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const toList = (name: string, titles: ListableTitle[]): TraktListContent => {
  const content: TraktListContent = { name, description: LIST_DESC, movies: [], shows: [] }
  for (const t of titles) {
    if (typeof t.tmdbId !== 'number') continue
    ;(t.tmdbType === 'tv' ? content.shows : content.movies).push(t.tmdbId)
  }
  return content
}

export async function buildTraktLists(): Promise<TraktListsPlan> {
  const plan: TraktListsPlan = { lists: [], skipped: [] }
  const changes = await getProviderChanges(BROADCAST_PROVIDERS)

  // Free-tier accounts cap at 5 lists — the merged departures list is the
  // signature content, so it claims a slot before per-provider lists do.
  const monthly = await getMonthlyChanges(BROADCAST_PROVIDERS)
  const departures: (DatedCatalogTitle | LeavingSoonTitle)[] = []
  for (const key of BROADCAST_PROVIDERS) {
    departures.push(...(monthly[key]?.departed || []), ...(monthly[key]?.leavingSoon || []))
  }
  const departuresList = toList(`Leaving Soon ${new Date().toISOString().slice(0, 7)}`, pickTop(dedupe(departures)))
  if (departuresList.movies.length || departuresList.shows.length) plan.lists.push(departuresList)
  else plan.skipped.push(departuresList.name)

  for (const key of BROADCAST_PROVIDERS) {
    const name = `New on ${providerLabel(key)} this week`
    const added = pickTop(changes[key]?.added || [])
    if (!added.length) {
      plan.skipped.push(name)
      continue
    }
    plan.lists.push(toList(name, added))
  }

  return plan
}
