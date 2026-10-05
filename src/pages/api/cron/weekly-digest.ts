import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis } from '../../../utils/redis'
import { getProviderChanges, type CatalogTitle, type ComingTitle, type ProviderChanges } from '../../../utils/streamingChanges'
import { CONFIRMED_KEY } from '../../../utils/waitlistStore'
import { isCronAuthorized } from '../../../utils/auth'

export const config = { maxDuration: 60 }

const MAX_ITEMS = 10

type DigestItem = (CatalogTitle | ComingTitle) & { provider: string; providerKey: string }

interface DigestItems {
  added: DigestItem[]
  coming: DigestItem[]
}

const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (stamp: string | null | undefined) => {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ''
}

const titlePath = (t: DigestItem) => `/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`

function gatherItems(changes: Record<string, ProviderChanges>): DigestItems {
  const seen = new Set<string>()
  const pick = (kind: 'added' | 'coming') => {
    const items: DigestItem[] = []
    for (const [providerKey, change] of Object.entries(changes)) {
      for (const t of change[kind] || []) {
        const id = `${t.tmdbType}:${t.tmdbId}`
        if (seen.has(id)) continue
        seen.add(id)
        items.push({ ...t, provider: change.source, providerKey })
      }
    }
    return items
  }
  return { added: pick('added').slice(0, MAX_ITEMS), coming: pick('coming').slice(0, MAX_ITEMS) }
}

function itemList(siteUrl: string, items: DigestItem[], showDate: boolean) {
  if (!items.length) return ''
  return `<ul style="padding-left: 18px; margin: 6px 0 18px;">${items
    .map(
      (t) =>
        `<li style="margin: 4px 0;"><a href="${siteUrl}${titlePath(t)}" style="color: #2b6cb0;">${escapeHtml(t.title)}</a>` +
        `<span style="color: #666;"> — ${escapeHtml(t.provider)}${showDate && 'date' in t && t.date ? `, ${prettyDate(t.date)}` : ''}${'season' in t && t.season ? `, season ${t.season}` : ''}</span></li>`
    )
    .join('')}</ul>`
}

function buildEmail(siteUrl: string, items: DigestItems, email: string, token: string) {
  const unsub = `${siteUrl}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${token}`
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #111;">
      <h2 style="margin-bottom: 4px;">This week on streaming</h2>
      <p style="color: #666; margin-top: 0;">New arrivals and what's coming to the services you follow on Galaxy Movies.</p>
      ${items.added.length ? `<h3 style="margin-bottom: 4px;">Just added</h3>${itemList(siteUrl, items.added, false)}` : ''}
      ${items.coming.length ? `<h3 style="margin-bottom: 4px;">Coming soon</h3>${itemList(siteUrl, items.coming, true)}` : ''}
      <p style="margin-top: 24px;"><a href="${siteUrl}/new-on-streaming" style="color: #2b6cb0;">See everything new on streaming →</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 12px;" />
      <p style="color: #999; font-size: 12px;">
        You asked for streaming alerts from Galaxy Movies.
        <a href="${unsub}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>`
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ skipped: 'RESEND_API_KEY not set' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Redis unavailable' })
  }

  try {
    const changes = await getProviderChanges([
      'netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max'
    ])
    const items = gatherItems(changes)
    if (!items.added.length && !items.coming.length) {
      return res.status(200).json({ sent: 0, reason: 'no changes this week' })
    }

    const confirmed = await kv.hgetall<Record<string, string>>(CONFIRMED_KEY)
    const entries = Object.entries(confirmed || {})
    if (!entries.length) {
      return res.status(200).json({ sent: 0, reason: 'no subscribers' })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
    const from = process.env.RESEND_FROM || 'Galaxy Movies <onboarding@resend.dev>'

    const results = await Promise.allSettled(
      entries.map(([email, token]) => {
        const { html, headers } = buildEmail(siteUrl, items, email, token)
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from,
            to: email,
            subject: 'New this week on streaming',
            html,
            headers
          })
        })
      })
    )

    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    const failed = results.length - sent
    return res.status(200).json({ sent, failed, total: entries.length })
  } catch (err) {
    console.error('Weekly digest failed:', err)
    return res.status(500).json({ error: 'Digest failed' })
  }
}
