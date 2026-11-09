import type { MonthlyChanges, ProviderChanges } from './streamingChanges'
import { providerLabel } from './embed'
import { SITE_URL } from '../../lib/site'

export interface RssItem {
  title: string
  link: string
  guid: string
  pubDate: number
  category: string
  description: string
}

export interface RssChannel {
  title: string
  link: string
  description: string
  self: string
}

const MAX_ITEMS = 50

export const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const titleUrl = (type: 'movie' | 'tv', id: number) => `${SITE_URL}/${type === 'tv' ? 'tv' : 'movies'}/${id}`

const asMs = (date: string) => {
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

// Per-provider feed items: dated events (coming/leaving/arrived/departed)
// publish on their date; undated diffs (added/left) publish at the snapshot
// stamp. Same sources the ICS feed (publicProviderEvents) reads, plus the
// undated buckets it can't use — a feed item and a calendar entry never disagree.
export function providerRssItems(
  providerKey: string,
  change: ProviderChanges | null | undefined,
  monthly: MonthlyChanges | null | undefined
): RssItem[] {
  const label = providerLabel(providerKey)
  const stamp = change?.updatedAt || monthly?.updatedAt || Date.now()
  const seen = new Set<string>()
  const items: RssItem[] = []

  const push = (
    kind: string,
    item: { tmdbId: number | null; tmdbType: 'movie' | 'tv'; title: string; date?: string | null; season?: number | null; year?: number | null },
    verb: string,
    dated: boolean
  ) => {
    if (!item.tmdbId) return
    const dateMs = item.date ? asMs(item.date) : null
    if (dated && dateMs === null) return
    const guid = `pub:${providerKey}:${item.tmdbType}:${item.tmdbId}:${kind}:${item.date || stamp}@galaxymovies.app`
    if (seen.has(guid)) return
    seen.add(guid)
    const season = item.season ? ` season ${item.season}` : ''
    items.push({
      title: `${item.title}${season} ${verb} ${label}`,
      link: titleUrl(item.tmdbType, item.tmdbId),
      guid,
      pubDate: dateMs ?? stamp,
      category: kind,
      description: `${item.title}${season} ${verb} ${label}${item.date ? ` on ${item.date}` : ''}.`
    })
  }

  for (const t of change?.coming || []) push('coming', t, 'comes to', true)
  for (const t of change?.leavingSoon || []) push('leaving', t, 'leaves', true)
  for (const t of monthly?.arrived || []) push('arrived', t, 'arrived on', true)
  for (const t of monthly?.departed || []) push('departed', t, 'left', true)
  for (const t of change?.added || []) push('added', t, 'added to', false)
  for (const t of change?.left || []) push('left', t, 'left', false)

  items.sort((a, b) => b.pubDate - a.pubDate)
  return items.slice(0, MAX_ITEMS)
}

export function buildRss(items: RssItem[], channel: RssChannel): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeXml(channel.title)}</title>
<link>${escapeXml(channel.link)}</link>
<description>${escapeXml(channel.description)}</description>
<atom:link href="${escapeXml(channel.self)}" rel="self" type="application/rss+xml" />
<language>en-us</language>
<ttl>60</ttl>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map(
    (i) => `<item>
<title>${escapeXml(i.title)}</title>
<link>${escapeXml(i.link)}</link>
<guid isPermaLink="false">${escapeXml(i.guid)}</guid>
<pubDate>${new Date(i.pubDate).toUTCString()}</pubDate>
<category>${escapeXml(i.category)}</category>
<description>${escapeXml(i.description)}</description>
</item>`
  )
  .join('\n')}
</channel>
</rss>
`
}
