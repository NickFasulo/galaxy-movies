import { embeddableProviders, isEmbeddableProvider, providerLabel } from '../catalog/embed'
import { getProviderChanges } from '../catalog/streamingChanges'
import type { CatalogTitle, ComingTitle, LeavingSoonTitle } from '../catalog/streamingChanges'
import { lookupWhere } from '../catalog/whereLookup'
import { safeEqual } from '../../lib/auth'
import { SITE_URL } from '../../lib/site'

// Slack signs x-www-form-urlencoded bodies, so the payload arrives as flat
// fields, not a JSON tree like Discord.
export interface SlackCommand {
  command?: string
  text?: string
  team_id?: string
  channel_id?: string
  user_id?: string
  response_url?: string
}

export interface SlackPayload {
  response_type: 'ephemeral' | 'in_channel'
  text: string
  blocks?: { type: string; text?: { type: string; text: string }; elements?: { type: string; text: string }[] }[]
}

const MAX_ITEMS = 10
const FOOTER = 'Powered by Galaxy Movies • updated daily'
const titleUrl = (type: 'movie' | 'tv', id: number) => `${SITE_URL}/${type === 'tv' ? 'tv' : 'movies'}/${id}`

const itemLine = (t: CatalogTitle | ComingTitle | LeavingSoonTitle, label?: string) => {
  const title = t.tmdbId ? `<${titleUrl(t.tmdbType, t.tmdbId)}|${t.title}>` : `*${t.title}*`
  const year = 'year' in t && t.year ? ` (${t.year})` : ''
  const season = 'season' in t && t.season ? ` s${t.season}` : ''
  const date = 'date' in t && t.date ? ` — ${t.date}` : ''
  return `${title}${year}${season}${date}${label ? ` — ${label}` : ''}`
}

const reply = (text: string, responseType: SlackPayload['response_type'] = 'ephemeral'): SlackPayload => ({
  response_type: responseType,
  text,
  blocks: [
    { type: 'section', text: { type: 'mrkdwn', text } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: FOOTER }] }
  ]
})

const providerUsage = (): SlackPayload =>
  reply(`Pick a service: ${embeddableProviders().map((p) => `\`${p.key}\``).join(' ')}`)

export function parseSlackPayload(rawBody: string): SlackCommand {
  const p = new URLSearchParams(rawBody)
  const get = (k: string) => p.get(k) || undefined
  return {
    command: get('command'),
    text: get('text'),
    team_id: get('team_id'),
    channel_id: get('channel_id'),
    user_id: get('user_id'),
    response_url: get('response_url')
  }
}

// Slack sends the raw command text; a bare provider key selects the service.
const textArg = (text: string | undefined) => text?.trim().toLowerCase() || undefined

async function newCommand(text: string | undefined): Promise<SlackPayload> {
  const provider = textArg(text)

  if (provider) {
    if (!isEmbeddableProvider(provider)) return providerUsage()
    const changes = await getProviderChanges([provider])
    const items = (changes[provider]?.added || []).slice(0, MAX_ITEMS)
    const label = providerLabel(provider)
    if (!items.length) {
      return reply(`*New on ${label}*\nNo new arrivals tracked this week — <${SITE_URL}/streaming/${provider}|browse the ${label} catalog>.`)
    }
    return reply(`*New on ${label} this week*\n${items.map((t) => itemLine(t)).join('\n')}\n<${SITE_URL}/leaving/${provider}|Full list →>`)
  }

  const keys = embeddableProviders().map((p) => p.key)
  const changes = await getProviderChanges(keys)
  const merged: (CatalogTitle & { label: string })[] = []
  for (const key of keys) {
    for (const t of changes[key]?.added || []) merged.push({ ...t, label: providerLabel(key) })
  }
  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
  const items = merged.slice(0, MAX_ITEMS)
  return reply(
    `*New on streaming this week*\n${items.length ? items.map((t) => itemLine(t, t.label)).join('\n') : 'No arrivals tracked this week.'}\n<${SITE_URL}/leaving|Full list →>`
  )
}

async function leavingCommand(text: string | undefined): Promise<SlackPayload> {
  const provider = textArg(text)
  if (!provider || !isEmbeddableProvider(provider)) return providerUsage()

  const changes = await getProviderChanges([provider])
  const change = changes[provider]
  const leavingSoon = (change?.leavingSoon || []).slice(0, MAX_ITEMS)
  const left = (change?.left || []).slice(0, Math.max(0, MAX_ITEMS - leavingSoon.length))
  const lines = [...leavingSoon.map((t) => itemLine(t)), ...left.map((t) => itemLine(t))]
  const label = providerLabel(provider)
  return reply(
    `*Leaving ${label}*\n${lines.length ? lines.join('\n') : `No departures tracked — <${SITE_URL}/streaming/${provider}|browse the ${label} catalog>.`}\n<${SITE_URL}/leaving/${provider}|Full list →>`
  )
}

export async function whereCommand(text: string | undefined): Promise<SlackPayload> {
  const query = (text || '').trim().slice(0, 100)
  if (!query) return reply('Give me a title, e.g. `/where fight club`.')

  const result = await lookupWhere({ title: query, region: 'US' })
  if (!result) {
    return reply(`Couldn't pin that one down. <${SITE_URL}/search?q=${encodeURIComponent(query)}|Search on Galaxy Movies>`)
  }

  const names = (list: { name: string }[]) => list.map((p) => p.name).join(', ')
  const sections: string[] = []
  const sub = [...result.providers.flatrate, ...result.providers.free, ...result.providers.ads]
  if (result.providers.flatrate.length) sections.push(`*Stream:* ${names(result.providers.flatrate)}`)
  const free = [...result.providers.free, ...result.providers.ads]
  if (free.length) sections.push(`*Free:* ${names(free)}`)
  const rentBuy = [...result.providers.rent, ...result.providers.buy]
  if (rentBuy.length) sections.push(`*Rent/buy:* ${names(rentBuy)}`)
  if (!sub.length && !rentBuy.length) sections.push('Not streaming anywhere in this region right now.')

  return reply(`*${result.title}${result.year ? ` (${result.year})` : ''} — where to watch (${result.region})*\n${sections.join('\n')}\n<${result.url}|Details →>`, 'in_channel')
}

function calendarCommand(text: string | undefined): SlackPayload {
  const provider = textArg(text)
  if (!provider || !isEmbeddableProvider(provider)) return providerUsage()
  return reply(`<${SITE_URL}/api/cal/${provider}|Subscribe to the ${providerLabel(provider)} arrivals & departures calendar> — works in Google/Apple/Outlook.`)
}

export const WHERE_COMMAND = '/where'

// true for commands that answer from the Redis diff snapshot alone — the route
// can reply synchronously. /where costs TMDB calls so it goes through the
// response_url followup path.
export function isDeferred(command: string | undefined): boolean {
  return command === WHERE_COMMAND
}

export async function buildCommandResponse(cmd: SlackCommand): Promise<SlackPayload> {
  switch (cmd.command) {
    case '/new':
      return newCommand(cmd.text)
    case '/leaving':
      return leavingCommand(cmd.text)
    case '/where':
      return whereCommand(cmd.text)
    case '/calendar':
      return calendarCommand(cmd.text)
    default:
      return reply('Unknown command.')
  }
}

// ---------- signature verification ----------

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// Slack's v0 scheme: HMAC-SHA256 over "v0:{ts}:{rawBody}" — verify before any
// work; the signature check is the endpoint's abuse guard. Timestamp must be
// within 5 minutes to block replay.
export async function verifySlackSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string,
  nowSeconds: number = Date.now() / 1000
): Promise<boolean> {
  try {
    const ts = Number(timestamp)
    if (!ts || !signature.startsWith('v0=') || Math.abs(nowSeconds - ts) > 300) return false
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${rawBody}`))
    return safeEqual(`v0=${hex(mac)}`, signature)
  } catch {
    return false
  }
}
