import { fetchTmdb } from '../catalog/tmdb'
import { getFirstPlayableVideo } from '../catalog/youtubeCache'
import type { TmdbMovie, TmdbMovieDetails, TmdbPaged } from '../../types/tmdb'
import { SITE_URL } from '../../lib/site'

// Weekly companion to scripts/check-upcoming-indexing.js — same upcoming set
// and inspection calls, WebCrypto JWT so it runs in workerd where node
// crypto.sign is unavailable.
// Full scope — readonly can't PUT sitemap resubmits. Inspection and Search
// Analytics are reads anyway, so this only adds the resubmit.
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters'
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'

export interface PendingEntry {
  url: string
  title: string
  state: string
  link: string
}

export interface IndexReport {
  checked: number
  indexed: number
  pending: PendingEntry[]
  errors: { title: string; message: string }[]
}

export const hasGscCredentials = () => Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY)

const b64u = (input: string | ArrayBuffer) => {
  const s = typeof input === 'string' ? input : String.fromCharCode(...new Uint8Array(input))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signingKey(): Promise<CryptoKey> {
  const pem = (process.env.GSC_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0)
  )
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

let cachedToken: { token: string; exp: number } | null = null

export async function gscAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.token
  const token = await mintToken()
  cachedToken = { token, exp: Date.now() + 3500 * 1000 }
  return token
}

export const gscSite = () => process.env.GSC_SITE_URL || 'sc-domain:galaxymovies.app'

async function mintToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(
    JSON.stringify({
      iss: process.env.GSC_CLIENT_EMAIL,
      scope: GSC_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })
  )}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(), new TextEncoder().encode(unsigned))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64u(sig)}`
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`token exchange failed: ${res.status}`)
  return data.access_token as string
}

interface InspectionResult {
  indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string }
  inspectionResultLink?: string
}

async function inspect(token: string, url: string): Promise<InspectionResult> {
  const res = await fetch(INSPECT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inspectionUrl: url,
      siteUrl: gscSite(),
      languageCode: 'en-US'
    })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`inspect ${url}: ${data?.error?.message || res.status}`)
  return data.inspectionResult || {}
}

export const isIndexed = (st: InspectionResult['indexStatusResult']) =>
  st?.verdict === 'PASS' || st?.coverageState === 'Submitted and indexed'

// Sorted so week-over-week comparisons are order-independent.
export const pendingSignature = (entries: { url: string }[]) =>
  entries.map((e) => e.url).sort().join('|')

async function upcoming(region: 'US' | 'IN'): Promise<TmdbMovie[]> {
  const data = await fetchTmdb<TmdbPaged<TmdbMovie>>('/discover/movie', {
    page: 1,
    include_adult: 'false',
    sort_by: 'popularity.desc',
    region,
    'release_date.gte': new Date().toISOString().split('T')[0],
    'vote_count.gte': 10
  }).catch((): null => null)
  return data?.results || []
}

// Shared with bingCheck.ts so the Google and Bing verdicts cover the same set.
export async function upcomingTitles(topN = 12): Promise<TmdbMovie[]> {
  const seen = new Set<number>()
  return [...(await upcoming('US')), ...(await upcoming('IN'))]
    .filter((t) => t?.id && t.overview && !seen.has(t.id) && seen.add(t.id))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, topN)
}

async function inspectInto(report: IndexReport, token: string, url: string, title: string) {
  try {
    const r = await inspect(token, url)
    const st = r.indexStatusResult
    if (isIndexed(st)) {
      report.indexed++
    } else {
      report.pending.push({
        url,
        title,
        state: st?.coverageState || st?.verdict || 'unknown',
        link: r.inspectionResultLink || url
      })
    }
  } catch (err) {
    report.errors.push({ title, message: err instanceof Error ? err.message : String(err) })
  }
}

export async function runIndexCheck(topN = 12, titles?: TmdbMovie[]): Promise<IndexReport> {
  const checkTitles = titles ?? (await upcomingTitles(topN))
  const token = await gscAccessToken()
  const report: IndexReport = { checked: checkTitles.length, indexed: 0, pending: [], errors: [] }

  for (const t of checkTitles) {
    await inspectInto(report, token, `${SITE_URL}/movies/${t.id}`, t.title || String(t.id))
  }
  return report
}

// Trailer watch pages only exist where a playable video resolves — a
// trailer-less title's /trailer 404s and would sit in pending forever.
export async function trailerUrlFor(title: TmdbMovie): Promise<string | null> {
  const details = await fetchTmdb<TmdbMovieDetails>(`/movie/${title.id}`, { append_to_response: 'videos' })
  const video = await getFirstPlayableVideo(details.videos?.results)
  return video ? `${SITE_URL}/movies/${title.id}/trailer` : null
}

export async function runTrailerCheck(titles: TmdbMovie[]): Promise<IndexReport> {
  const token = await gscAccessToken()
  const report: IndexReport = { checked: 0, indexed: 0, pending: [], errors: [] }

  for (const t of titles) {
    let url: string | null
    try {
      url = await trailerUrlFor(t)
    } catch (err) {
      report.errors.push({ title: t.title || String(t.id), message: err instanceof Error ? err.message : String(err) })
      continue
    }
    if (!url) continue
    report.checked++
    await inspectInto(report, token, url, t.title || url)
  }
  return report
}
