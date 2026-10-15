import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../utils/api'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../utils/billing'
import { getRedis, CHAT_HISTORY_KEY } from '../../utils/waitlistStore'

const MAX_MESSAGES = 30
const MAX_LINK_KEYS = 30
const MAX_BODY_BYTES = 30_000

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatLink {
  match: string
  movieId: number
  mediaType: string
  title: string
  year?: string
  poster_path?: string | null
  releaseDate?: string
}

function parseMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null
  const out: ChatMessage[] = []
  for (const raw of input.slice(-MAX_MESSAGES)) {
    if (!raw || typeof raw !== 'object') return null
    const { role, content } = raw as Record<string, unknown>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.length > 4000) return null
    out.push({ role, content })
  }
  return out
}

function parseLinks(input: unknown): Record<string, ChatLink[]> | null {
  if (input === undefined || input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) return null
  const out: Record<string, ChatLink[]> = {}
  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.length > MAX_LINK_KEYS) return null
  for (const [key, arr] of entries) {
    if (!/^\d+$/.test(key) || !Array.isArray(arr) || arr.length > 10) return null
    const links: ChatLink[] = []
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') return null
      const { match, movieId, mediaType, title, year, poster_path, releaseDate } = raw as Record<string, unknown>
      if (typeof match !== 'string' || match.length > 100) return null
      if (typeof movieId !== 'number' || !Number.isFinite(movieId)) return null
      if (mediaType !== 'movie' && mediaType !== 'tv') return null
      if (typeof title !== 'string' || title.length > 100) return null
      const link: ChatLink = { match, movieId, mediaType, title }
      if (typeof year === 'string' && /^\d{4}$/.test(year)) link.year = year
      if (typeof poster_path === 'string' && poster_path.length <= 200) link.poster_path = poster_path
      else if (poster_path === null) link.poster_path = null
      if (typeof releaseDate === 'string' && releaseDate.length <= 10) link.releaseDate = releaseDate
      links.push(link)
    }
    out[key] = links
  }
  return out
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'chathist_rl',
    maxRequests: 30,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) {
    return res.status(403).json({ error: 'Invalid sync credentials' })
  }
  if (!isPlusActive(await getBillingRecord(email))) {
    return res.status(403).json({ error: 'Galaxy Plus is required for synced chat history.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Chat history is temporarily unavailable.' })
  }

  try {
    if (req.method === 'GET') {
      const history = await kv.hget(CHAT_HISTORY_KEY, email)
      return res.status(200).json({ history: history ?? null })
    }

    if (JSON.stringify(req.body).length > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'History payload too large' })
    }
    const messages = parseMessages(req.body?.messages)
    const links = parseLinks(req.body?.links)
    if (!messages || !links) {
      return res.status(400).json({ error: 'Invalid history payload' })
    }

    const updatedAt = Date.now()
    if (!messages.length && !Object.keys(links).length) {
      await kv.hdel(CHAT_HISTORY_KEY, email)
      return res.status(200).json({ ok: true, updatedAt })
    }
    await kv.hset(CHAT_HISTORY_KEY, { [email]: { messages, links, updatedAt } })
    return res.status(200).json({ ok: true, updatedAt })
  } catch (err) {
    console.error('Chat history error:', err)
    return res.status(500).json({ error: 'Could not save chat history.' })
  }
}
