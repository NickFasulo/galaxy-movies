import { getProviderChanges } from '../catalog/streamingChanges'
import { getRedis } from '../../lib/redis'
import { sendEmail, emailLayout, escapeHtml } from '../../lib/email'
import { redditAccessToken, redditSubmit } from './socialChannels'
import { providerLabel } from './socialBroadcast'
import { SITE_URL } from '../../lib/site'

// Weekly community-engagement post for OTHER people's subs — the
// reddit-engagement skill's play: contribute the data where it's wanted,
// don't drop links. Distinct from the Devvit own-sub cadence (multi-provider
// digest + monthly departures + question prompts) on every axis: one
// provider's sub per week, a community-voice post, Fridays.
//
// Mode gate: 'draft' (default) emails the formatted post to
// REDDIT_ENGAGE_EMAIL for manual posting — auto-submitting a brand/alt
// account's posts to provider subs without modmail approval is how accounts
// and domains get burned. Flip REDDIT_ENGAGE_MODE=post per-sub only after
// that sub's mods approve the recurring contribution.

interface EngageTarget {
  sub: string
  // Whether the post may carry the site link — flip per-sub only after its
  // self-promo rules/modmail allow it. Default false: the data IS the post.
  link: boolean
}

const ENGAGE_SUBS: Record<string, EngageTarget> = {
  netflix: { sub: 'NetflixBestOf', link: false },
  hulu: { sub: 'Hulu', link: false },
  'disney-plus': { sub: 'DisneyPlus', link: false },
  'amazon-prime-video': { sub: 'PrimeVideo', link: false },
  max: { sub: 'HBOMax', link: false },
  'apple-tv': { sub: 'appletvplus', link: false }
}
const ENGAGE_PROVIDERS = Object.keys(ENGAGE_SUBS)

const ENGAGE_DEDUPE_TTL = 60 * 60 * 24 * 8
const dedupeKey = (sub: string) => `gm:social:engage-reddit:last:${sub}`

export function engageProviderForWeek(now = new Date()): string {
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
  return ENGAGE_PROVIDERS[week % ENGAGE_PROVIDERS.length]
}

const digestDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

interface ProviderChange {
  added?: { title: string }[]
  left?: { title: string }[]
  coming?: { title: string; date?: string | null }[]
  leavingSoon?: { title: string; date?: string | null }[]
}

const join = (titles: { title: string; date?: string | null }[], cap: number, dated: boolean) =>
  titles
    .slice(0, cap)
    .map((t) => (dated && t.date ? `${t.title} (${digestDate(t.date)})` : t.title))
    .join(', ')

// Community-voice markdown — bullets, no brand chrome. `link` adds the
// site link only where the sub permits it.
export function buildProviderEngagePost(
  provider: string,
  change: ProviderChange,
  opts: { link?: boolean; maxLen?: number } = {}
): { title: string; text: string } {
  const label = providerLabel(provider)
  const maxLen = opts.maxLen ?? 10000
  const title = `What's new on ${label} this week (and what's leaving)`

  const sections: string[] = []
  if (change.added?.length) sections.push(`**Added:** ${join(change.added, 10, false)}`)
  if (change.left?.length) sections.push(`**Left:** ${join(change.left, 8, false)}`)
  if (change.leavingSoon?.length) sections.push(`**Leaving soon:** ${join(change.leavingSoon, 6, true)}`)
  if (change.coming?.length) sections.push(`**Coming soon:** ${join(change.coming, 6, true)}`)
  if (!sections.length) return { title, text: '' }

  const footer = opts.link ? `\n\nFull list updated daily: ${SITE_URL}/leaving/${provider}` : ''
  let text = sections.join('\n\n') + footer
  while (text.length > maxLen && sections.length > 1) {
    sections.pop()
    text = sections.join('\n\n') + footer
  }
  return { title, text: text.length > maxLen ? '' : text }
}

export interface EngageResult {
  status: 'posted' | 'emailed' | 'skipped' | 'failed'
  provider?: string
  sub?: string
  mode?: 'draft' | 'post'
  reason?: string
}

const engageCredsReady = () =>
  Boolean(
    process.env.REDDIT_ENGAGE_CLIENT_ID &&
      process.env.REDDIT_ENGAGE_CLIENT_SECRET &&
      process.env.REDDIT_ENGAGE_USERNAME &&
      process.env.REDDIT_ENGAGE_PASSWORD
  )

const engageEmail = () =>
  process.env.REDDIT_ENGAGE_EMAIL || process.env.INDEXING_REPORT_EMAIL || 'fasulo.nick@gmail.com'

export async function runRedditEngage(now = new Date()): Promise<EngageResult> {
  const provider = engageProviderForWeek(now)
  const target = ENGAGE_SUBS[provider]
  const mode = process.env.REDDIT_ENGAGE_MODE === 'post' ? ('post' as const) : ('draft' as const)
  const base = { provider, sub: target.sub, mode }

  const draftReady = Boolean(engageEmail() && process.env.RESEND_API_KEY)
  if (mode === 'post' ? !engageCredsReady() : !draftReady) {
    return { ...base, status: 'skipped', reason: mode === 'post' ? 'REDDIT_ENGAGE_* creds not configured' : 'no email target' }
  }

  const changes = await getProviderChanges([provider])
  const change = changes[provider]
  if (!change) return { ...base, status: 'skipped', reason: 'no changes data' }

  const { title, text } = buildProviderEngagePost(provider, change, { link: target.link })
  if (text.length < 40) return { ...base, status: 'skipped', reason: 'nothing to post' }

  const kv = getRedis()
  const key = dedupeKey(target.sub)
  const last = kv ? await kv.get<string>(key).catch(() => null) : null
  if (last === text) return { ...base, status: 'skipped', reason: 'already posted' }

  let failure: string | null = null
  if (mode === 'post') {
    const auth = await redditAccessToken(
      process.env.REDDIT_ENGAGE_CLIENT_ID!,
      process.env.REDDIT_ENGAGE_CLIENT_SECRET!,
      process.env.REDDIT_ENGAGE_USERNAME!,
      process.env.REDDIT_ENGAGE_PASSWORD!
    )
    if (!auth.token) return { ...base, status: 'failed', reason: auth.error || 'token missing' }
    failure = await redditSubmit(auth.token, { sub: target.sub, title, text })
  } else {
    const ok = await sendEmail({
      to: engageEmail()!,
      subject: `Reddit draft for r/${target.sub}: ${title}`,
      html: emailLayout({
        heading: 'Weekly Reddit draft',
        reason: 'Community-engagement draft — review, then post it to Reddit yourself.',
        body:
          `<p style="font-size:14px; color:#374151;">Post this to <strong>r/${escapeHtml(target.sub)}</strong> this week:</p>` +
          `<p style="font-size:15px; font-weight:600; color:#111827;">${escapeHtml(title)}</p>` +
          `<pre style="font-size:13px; background:#f4f4f5; padding:12px; border-radius:8px; white-space:pre-wrap;">${escapeHtml(text)}</pre>`
      })
    })
    failure = ok ? null : 'email send failed'
  }
  if (failure) return { ...base, status: 'failed', reason: failure }

  await kv?.set(key, text, { ex: ENGAGE_DEDUPE_TTL }).catch(() => {})
  return { ...base, status: mode === 'post' ? 'posted' : 'emailed' }
}
