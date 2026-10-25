import { SITE_URL } from '../../lib/site'
import { shortDate } from '../../lib/format/formatters'
import type { MatchedItem } from './watchlistAlerts'

const prettyDate = shortDate

const titlePath = (item: MatchedItem) => `/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}`

// Legacy Markdown (not MarkdownV2) — only these four characters need escaping.
const escapeMd = (s: string) => s.replace(/([_*[`])/g, '\\$1')

function statusLine(item: MatchedItem): string {
  switch (item.kind) {
    case 'coming':
      return `Coming to ${item.provider}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
    case 'leaving':
      return `Leaving ${item.provider} soon`
    case 'episode':
      return `New episode${item.season != null && item.episode != null ? ` S${item.season}E${item.episode}` : ''} airs ${prettyDate(item.date) || 'soon'}`
    case 'taste':
      return `Now on ${item.provider} — because you rated ${item.via || ''} highly`
    default:
      return `Now on ${item.provider}`
  }
}

export function buildTelegramText(items: MatchedItem[]): string {
  const rows = items
    .map((item) => `• [${escapeMd(item.title)}](${SITE_URL}${titlePath(item)}) — ${escapeMd(statusLine(item))}`)
    .join('\n')
  return `*Something on your list just moved*\n\n${rows}`.slice(0, 4000)
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true })
    })
    return resp.ok
  } catch {
    return false
  }
}

export async function sendTelegramAlert(chatId: string | number, items: MatchedItem[]): Promise<boolean> {
  return sendTelegramMessage(chatId, buildTelegramText(items))
}

// The connect link needs the bot's username; getMe is free and the answer never
// changes for a given token, so it lives in a module-level cache.
let botUsername: string | null = null
export async function getBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await resp.json()
    if (data?.ok && data.result?.username) {
      botUsername = data.result.username
      return botUsername
    }
  } catch {}
  return null
}
