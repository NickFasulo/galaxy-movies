import type { GetServerSidePropsContext } from 'next'
import { getProviderChanges } from '../features/catalog/streamingChanges'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../features/catalog/tmdb'
import { setSwrCache } from '../lib/ssr'
import { SITE_URL } from '../lib/site'

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const providerLabel = (key: string) => streamingProviders[key]?.title?.replace(/ Movies$/, '') || key

const MAX_ITEMS = 40

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  const changes = await getProviderChanges(Object.keys(PROVIDER_NAME_MATCH)).catch(() => ({}))

  interface FeedItem {
    title: string
    link: string
    guid: string
    pubDate: number
    description: string
  }

  const items: FeedItem[] = []
  for (const [key, change] of Object.entries(changes)) {
    const label = providerLabel(key)
    const pubDate = change.updatedAt || Date.now()
    for (const t of change.added) {
      if (!t.tmdbId) continue
      items.push({
        title: `${t.title} added to ${label}`,
        link: `${SITE_URL}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`,
        guid: `added:${t.tmdbType}:${t.tmdbId}@${key}:${pubDate}`,
        pubDate,
        description: `${t.title} is now streaming on ${label}.`
      })
    }
    for (const t of change.left) {
      if (!t.tmdbId) continue
      items.push({
        title: `${t.title} left ${label}`,
        link: `${SITE_URL}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`,
        guid: `left:${t.tmdbType}:${t.tmdbId}@${key}:${pubDate}`,
        pubDate,
        description: `${t.title} is no longer in the ${label} US catalog.`
      })
    }
    for (const t of change.coming) {
      if (!t.tmdbId) continue
      items.push({
        title: `${t.title} coming to ${label} ${t.date}`,
        link: `${SITE_URL}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`,
        guid: `coming:${t.tmdbType}:${t.tmdbId}@${key}:${t.date}`,
        pubDate,
        description: `${t.title} arrives on ${label} on ${t.date}.`
      })
    }
  }

  items.sort((a, b) => b.pubDate - a.pubDate)
  const feedItems = items.slice(0, MAX_ITEMS)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Galaxy Movies — streaming catalog changes</title>
<link>${SITE_URL}/leaving</link>
<description>Daily-tracked additions, departures, and upcoming releases across US streaming services.</description>
<atom:link href="${SITE_URL}/leaving.xml" rel="self" type="application/rss+xml" />
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feedItems
  .map(
    (i) => `<item>
<title>${escapeXml(i.title)}</title>
<link>${escapeXml(i.link)}</link>
<guid isPermaLink="false">${escapeXml(i.guid)}</guid>
<pubDate>${new Date(i.pubDate).toUTCString()}</pubDate>
<description>${escapeXml(i.description)}</description>
</item>`
  )
  .join('\n')}
</channel>
</rss>`

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
  setSwrCache(res, 3600)
  res.statusCode = 200
  res.end(xml)
  return { props: {} }
}

export default function LeavingFeed() {
  return null
}
