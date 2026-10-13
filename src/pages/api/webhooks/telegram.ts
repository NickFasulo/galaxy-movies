import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis } from '../../../utils/redis'
import { TELEGRAM_KEY } from '../../../utils/waitlistStore'
import { sendTelegramMessage } from '../../../utils/telegram'
import { safeEqual } from '../../../utils/auth'

interface TelegramUpdate {
  message?: {
    chat?: { id?: number }
    text?: string
  }
}

// Registered once via setWebhook with secret_token=TELEGRAM_WEBHOOK_SECRET —
// Telegram echoes it back on every update so spoofed posts can't link chats.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const header = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!secret || !safeEqual(header, secret)) return res.status(401).end()

  const kv = getRedis()
  if (!kv) return res.status(503).end()

  const update = req.body as TelegramUpdate
  const chatId = update?.message?.chat?.id
  const text = (update?.message?.text || '').trim()
  if (!chatId || !text.startsWith('/start')) {
    if (chatId && text === '/stop') {
      const hash = (await kv.hgetall<Record<string, string>>(TELEGRAM_KEY)) || {}
      const email = Object.keys(hash).find((e) => String(hash[e]) === String(chatId))
      if (email) {
        await kv.hdel(TELEGRAM_KEY, email)
        await sendTelegramMessage(chatId, 'Alerts disconnected. Email alerts will resume on your next match.')
      }
    }
    return res.status(200).end()
  }

  const token = text.slice('/start'.length).trim()
  const pending = token ? await kv.get<{ email?: string }>(`tglink:${token}`) : null
  if (!pending?.email) {
    await sendTelegramMessage(chatId, 'This link has expired — generate a new one from your Galaxy Movies watchlist.')
    return res.status(200).end()
  }

  await kv.hset(TELEGRAM_KEY, { [pending.email]: String(chatId) })
  await kv.del(`tglink:${token}`)
  await sendTelegramMessage(chatId, 'Connected. Watchlist alerts will arrive here instead of email.')
  res.status(200).end()
}
