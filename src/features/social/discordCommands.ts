import { embeddableProviders, isEmbeddableProvider, providerLabel } from '../catalog/embed'
import { getProviderChanges } from '../catalog/streamingChanges'
import type { CatalogTitle, ComingTitle, LeavingSoonTitle } from '../catalog/streamingChanges'
import { lookupWhere } from '../catalog/whereLookup'
import { SITE_URL } from '../../lib/site'

// Brand accent (#2b6cb0 from theme.ts) as a Discord embed int.
export const DISCORD_COLOR = 0x2b6cb0
export const EPHEMERAL_FLAG = 64
const MAX_ITEMS = 10

export interface DiscordInteraction {
  type?: number
  token?: string
  guild_id?: string
  channel_id?: string
  data?: {
    name?: string
    options?: { name?: string; value?: unknown }[]
  }
}

export interface DiscordEmbed {
  title: string
  description: string
  url?: string
  color: number
  footer: { text: string }
}

export interface CommandPayload {
  content?: string
  embeds?: DiscordEmbed[]
  flags?: number
}

const footer = () => ({ text: 'Powered by Galaxy Movies • updated daily' })
const titleUrl = (type: 'movie' | 'tv', id: number) => `${SITE_URL}/${type === 'tv' ? 'tv' : 'movies'}/${id}`

const itemLine = (t: CatalogTitle | ComingTitle | LeavingSoonTitle, label?: string) => {
  const title = t.tmdbId ? `**[${t.title}](${titleUrl(t.tmdbType, t.tmdbId)})**` : `**${t.title}**`
  const year = 'year' in t && t.year ? ` (${t.year})` : ''
  const season = 'season' in t && t.season ? ` s${t.season}` : ''
  const date = 'date' in t && t.date ? ` — ${t.date}` : ''
  return `${title}${year}${season}${date}${label ? ` — ${label}` : ''}`
}

export function optionValue(data: DiscordInteraction['data'], name: string): string | undefined {
  const raw = data?.options?.find((o) => o.name === name)?.value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

const providerUsage = (): CommandPayload => ({
  content: `Pick a service: ${embeddableProviders()
    .map((p) => `\`${p.key}\``)
    .join(' ')}`,
  flags: EPHEMERAL_FLAG
})

async function newCommand(data: DiscordInteraction['data']): Promise<CommandPayload> {
  const provider = optionValue(data, 'provider')?.toLowerCase()

  if (provider) {
    if (!isEmbeddableProvider(provider)) return providerUsage()
    const changes = await getProviderChanges([provider])
    const items = (changes[provider]?.added || []).slice(0, MAX_ITEMS)
    if (!items.length) {
      return { embeds: [{ title: `New on ${providerLabel(provider)}`, description: `No new arrivals tracked this week — [browse the ${providerLabel(provider)} catalog](${SITE_URL}/streaming/${provider}).`, color: DISCORD_COLOR, footer: footer() }] }
    }
    return {
      embeds: [
        {
          title: `New on ${providerLabel(provider)} this week`,
          description: items.map((t) => itemLine(t)).join('\n'),
          url: `${SITE_URL}/leaving/${provider}`,
          color: DISCORD_COLOR,
          footer: footer()
        }
      ]
    }
  }

  const keys = embeddableProviders().map((p) => p.key)
  const changes = await getProviderChanges(keys)
  const merged: (CatalogTitle & { label: string })[] = []
  for (const key of keys) {
    for (const t of changes[key]?.added || []) merged.push({ ...t, label: providerLabel(key) })
  }
  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
  const items = merged.slice(0, MAX_ITEMS)
  return {
    embeds: [
      {
        title: 'New on streaming this week',
        description: items.length ? items.map((t) => itemLine(t, t.label)).join('\n') : 'No arrivals tracked this week.',
        url: `${SITE_URL}/leaving`,
        color: DISCORD_COLOR,
        footer: footer()
      }
    ]
  }
}

async function leavingCommand(data: DiscordInteraction['data']): Promise<CommandPayload> {
  const provider = optionValue(data, 'provider')?.toLowerCase()
  if (!provider || !isEmbeddableProvider(provider)) return providerUsage()

  const changes = await getProviderChanges([provider])
  const change = changes[provider]
  const leavingSoon = (change?.leavingSoon || []).slice(0, MAX_ITEMS)
  const left = (change?.left || []).slice(0, Math.max(0, MAX_ITEMS - leavingSoon.length))
  const lines = [...leavingSoon.map((t) => itemLine(t)), ...left.map((t) => itemLine(t))]
  return {
    embeds: [
      {
        title: `Leaving ${providerLabel(provider)}`,
        description: lines.length
          ? lines.join('\n')
          : `No departures tracked — [browse the ${providerLabel(provider)} catalog](${SITE_URL}/streaming/${provider}).`,
        url: `${SITE_URL}/leaving/${provider}`,
        color: DISCORD_COLOR,
        footer: footer()
      }
    ]
  }
}

export async function whereCommand(data: DiscordInteraction['data']): Promise<CommandPayload> {
  const query = optionValue(data, 'query')
  if (!query) return { content: 'Give me a title, e.g. `/where fight club`.', flags: EPHEMERAL_FLAG }
  const regionParam = optionValue(data, 'region')
  const region = regionParam && /^[a-zA-Z]{2}$/.test(regionParam) ? regionParam.toUpperCase() : 'US'

  const result = await lookupWhere({ title: query.slice(0, 100), region })
  if (!result) {
    return {
      content: `Couldn't pin that one down. [Search on Galaxy Movies](${SITE_URL}/search?q=${encodeURIComponent(query)})`,
      flags: EPHEMERAL_FLAG
    }
  }

  const names = (list: { name: string }[]) => list.map((p) => p.name).join(', ')
  const sections: string[] = []
  const sub = [...result.providers.flatrate, ...result.providers.free, ...result.providers.ads]
  if (result.providers.flatrate.length) sections.push(`**Stream:** ${names(result.providers.flatrate)}`)
  const free = [...result.providers.free, ...result.providers.ads]
  if (free.length) sections.push(`**Free:** ${names(free)}`)
  const rentBuy = [...result.providers.rent, ...result.providers.buy]
  if (rentBuy.length) sections.push(`**Rent/buy:** ${names(rentBuy)}`)
  if (!sub.length && !rentBuy.length) sections.push('Not streaming anywhere in this region right now.')

  return {
    embeds: [
      {
        title: `${result.title}${result.year ? ` (${result.year})` : ''} — where to watch (${result.region})`,
        description: sections.join('\n'),
        url: result.url,
        color: DISCORD_COLOR,
        footer: footer()
      }
    ]
  }
}

function calendarCommand(data: DiscordInteraction['data']): CommandPayload {
  const provider = optionValue(data, 'provider')?.toLowerCase()
  if (!provider || !isEmbeddableProvider(provider)) return providerUsage()
  return {
    content: `[Subscribe to the ${providerLabel(provider)} arrivals & departures calendar](${SITE_URL}/api/cal/${provider}) — works in Google/Apple/Outlook.`,
    flags: EPHEMERAL_FLAG
  }
}

export const WHERE_COMMAND = 'where'
export const KNOWN_COMMANDS = ['new', 'leaving', 'where', 'calendar']

// true for commands that answer from the Redis diff snapshot alone — the route
// can reply synchronously. 'where' costs TMDB calls so it goes through the
// deferred-response path.
export function isDeferred(name: string | undefined): boolean {
  return name === WHERE_COMMAND
}

export async function buildCommandResponse(interaction: DiscordInteraction): Promise<CommandPayload> {
  const name = interaction.data?.name
  switch (name) {
    case 'new':
      return newCommand(interaction.data)
    case 'leaving':
      return leavingCommand(interaction.data)
    case 'where':
      return whereCommand(interaction.data)
    case 'calendar':
      return calendarCommand(interaction.data)
    default:
      return { content: 'Unknown command.', flags: EPHEMERAL_FLAG }
  }
}

// ---------- signature verification ----------

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

// Discord signs "timestamp + rawBody" with Ed25519 — verify before any work;
// the signature check is the endpoint's abuse guard. Needs Node ≥20 / workerd.
export async function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const keyBytes = hexToBytes(publicKeyHex)
    const sig = hexToBytes(signatureHex)
    if (!keyBytes || !sig || !timestamp) return false
    const key = await crypto.subtle.importKey('raw', keyBytes, 'Ed25519', false, ['verify'])
    const tsBytes = new TextEncoder().encode(timestamp)
    const bodyBytes = new TextEncoder().encode(rawBody)
    const data = new Uint8Array(new ArrayBuffer(tsBytes.length + bodyBytes.length))
    data.set(tsBytes, 0)
    data.set(bodyBytes, tsBytes.length)
    return await crypto.subtle.verify('Ed25519', key, sig, data)
  } catch {
    return false
  }
}
