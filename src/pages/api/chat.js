import OpenAI from 'openai'
import { createHash } from 'crypto'
import { LRUCache } from 'lru-cache'
import { extractQuotedMovieMentions, resolveMovieMentions, getRecentReleases, formatMovieForChat } from '../../utils/movieSearch'
const { isBot, getClientIP, checkDistributedRateLimit, checkGlobalBudget } = require('../../utils/rateLimiter')

let openai

const chatCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 30 })

const recentReleasesCache = new LRUCache({ max: 1, ttl: 1000 * 60 * 60 })

const RECENT_RELEASES_KEYWORDS = [
  'recent movie', 'recent release', 'recently released', 'new movie', 'newest movie',
  'new release', 'latest movie', 'latest release', 'just released', 'now playing',
  'in theaters now', 'currently in theaters', 'best recent', "what's new", 'this year'
]

function isRecentReleasesQuery(text) {
  const lower = text.toLowerCase()
  return RECENT_RELEASES_KEYWORDS.some((keyword) => lower.includes(keyword))
}

async function getRecentReleasesContext() {
  const cached = recentReleasesCache.get('context')
  if (cached) return cached

  const { results } = await getRecentReleases(1)
  const context = results
    .slice(0, 8)
    .map(formatMovieForChat)
    .map((movie) => `"${movie.title} (${movie.year})" - rating ${movie.rating}/10 - ${movie.overview}`)
    .join('\n')

  recentReleasesCache.set('context', context)
  return context
}

const MAX_REQUESTS_PER_HOUR = 20
const MAX_CONVERSATION_LENGTH = 10
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60
const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_MESSAGE_LENGTH = 2000
const GLOBAL_DAILY_CHAT_BUDGET = 3000

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb'
    }
  }
}

function getConversationCacheKey(messages, tasteProfile) {
  const hash = createHash('sha256')
    .update(JSON.stringify([messages.map((m) => [m.role, m.content]), tasteProfile]))
    .digest('hex')
  return `chat:${hash}`
}

// Caps each field so a crafted body can't inflate the prompt — this is injected
// into the system message, so treat it as untrusted input.
function sanitizeTasteProfile(tp) {
  if (!tp || typeof tp !== 'object') return null
  const list = (v, n) => Array.isArray(v)
    ? v.filter((s) => typeof s === 'string').map((s) => s.substring(0, 80)).slice(0, n)
    : []
  const profile = {
    topRated: list(tp.topRated, 10),
    disliked: list(tp.disliked, 5),
    watchlist: list(tp.watchlist, 15),
    services: list(tp.services, 8)
  }
  const hasAny = Object.values(profile).some((arr) => arr.length > 0)
  return hasAny ? profile : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  if (isBot(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Bot access denied' })
  }

  const { messages: rawMessages, tasteProfile: rawTasteProfile } = req.body || {}
  const tasteProfile = sanitizeTasteProfile(rawTasteProfile)

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' })
  }

  const rawLast = rawMessages[rawMessages.length - 1]
  if (!rawLast || rawLast.role !== 'user' || typeof rawLast.content !== 'string' || !rawLast.content.trim()) {
    return res.status(400).json({ error: 'Valid message content is required' })
  }

  if (rawLast.content.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message content too long (max ${MAX_MESSAGE_LENGTH} characters)` })
  }

  // Only user/assistant turns are accepted so a client can't smuggle in its own system prompt.
  const messages = rawMessages
    .slice(-MAX_CONVERSATION_LENGTH)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_MESSAGE_LENGTH) }))

  const clientId = getClientIP(req)
  const allowed = await checkDistributedRateLimit(clientId, {
    keyPrefix: 'chat_rl',
    maxRequests: MAX_REQUESTS_PER_HOUR,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS
  })
  if (!allowed) {
    res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_SECONDS))
    return res.status(429).json({ error: 'Chat request limit reached. Please try again later.' })
  }

  const cacheKey = getConversationCacheKey(messages, tasteProfile)
  const cachedEntry = chatCache.get(cacheKey)
  if (cachedEntry) {
    return res.status(200).json({ response: cachedEntry.text, links: cachedEntry.links, cached: true })
  }

  const withinBudget = await checkGlobalBudget('chat', {
    maxRequests: GLOBAL_DAILY_CHAT_BUDGET,
    windowSeconds: 60 * 60 * 24
  })
  if (!withinBudget) {
    return res.status(503).json({ error: 'AI chat is busy right now. Please try again later.' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI chat is temporarily unavailable.' })
  }

  try {
    openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    let recentReleasesContext = ''
    if (isRecentReleasesQuery(lastMessage.content)) {
      try {
        recentReleasesContext = await getRecentReleasesContext()
      } catch (error) {
        console.error('Error fetching recent releases for grounding:', error)
      }
    }

    const today = new Date().toISOString().split('T')[0]

    let tasteContext = ''
    if (tasteProfile) {
      const parts = []
      if (tasteProfile.topRated.length) parts.push(`- Titles they loved: ${tasteProfile.topRated.join(', ')}`)
      if (tasteProfile.disliked.length) parts.push(`- Titles they disliked: ${tasteProfile.disliked.join(', ')}`)
      if (tasteProfile.watchlist.length) parts.push(`- On their watchlist: ${tasteProfile.watchlist.join(', ')}`)
      if (tasteProfile.services.length) parts.push(`- Streaming services they subscribe to: ${tasteProfile.services.join(', ')}`)
      if (parts.length) {
        tasteContext = `

The user's taste profile — personalize recommendations accordingly. Do not recommend titles they already disliked or rated; prefer titles matching their highly-rated picks and available on their services when relevant:
${parts.join('\n')}`
      }
    }

    const systemMessage = {
      role: 'system',
      content: `You are a helpful movie and TV show discovery assistant for Galaxy Movies. Your goal is to help users find movies and shows they'll enjoy based on their preferences, mood, or specific criteria.

Today's date is ${today}. Your own knowledge of movies may be outdated, so do not assume you know what counts as "recent" — rely on the verified data provided below when it's available.${recentReleasesContext ? `

Here is a verified list of movies actually in theaters or recently released as of today. Use ONLY these when the user asks about recent, new, or currently popular releases:
${recentReleasesContext}` : ''}${tasteContext}

Key capabilities:
- Recommend movies and TV shows based on genre, mood, time period, actors, directors, or themes
- Consider streaming platform availability when making recommendations
- Help users decide what to watch when they're experiencing choice paralysis
- Provide context about why a movie might be a good fit
- Suggest alternatives if a user has already seen a recommendation

Guidelines:
- Be concise and direct in your responses
- Do NOT use markdown formatting (no **bold**, *italic*, \`code\`, [links], or numbered lists)
- Do NOT use brackets [] or create links in your responses
- Use plain text only - no special formatting characters
- Focus on practical recommendations
- Ask clarifying questions when needed to understand preferences
- Consider the user's stated preferences and previous context
- Provide 2-3 specific movie or show recommendations with brief justifications
- If mentioning streaming platforms, note that availability varies by region
- CRITICAL: When mentioning movie or show titles, ALWAYS format them with quotes like this: "Title (Year)" - this is required for the system to create clickable links
- Use simple bullet points or commas to separate items, not numbered lists
- After each title in quotes, add a brief description on the same line or the next line

When users ask about group decision making:
- Help identify common ground between different preferences
- Suggest movies that might appeal to multiple tastes
- Consider compromise options that balance different group members' interests

Keep responses conversational but focused on actionable movie and show recommendations.`
    }

    const allMessages = [systemMessage, ...messages]

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: allMessages,
      max_tokens: 300,
      temperature: 0.7,
      stream: true
    })

    req.on('close', () => {
      if (!res.writableEnded) stream.controller.abort()
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    let fullResponse = ''

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullResponse += content
        res.write(`data: ${JSON.stringify({ content })}\n\n`)
      }
    }

    let links = []
    if (fullResponse.trim()) {
      try {
        const mentions = extractQuotedMovieMentions(fullResponse)
        if (mentions.length > 0) {
          links = await resolveMovieMentions(mentions)
        }
      } catch (error) {
        console.error('Error resolving movie links:', error)
      }
    }

    if (links.length > 0) {
      res.write(`data: ${JSON.stringify({ links })}\n\n`)
    }

    res.write('data: [DONE]\n\n')
    res.end()

    if (fullResponse.trim()) {
      chatCache.set(cacheKey, { text: fullResponse, links })
    }

  } catch (error) {
    console.error('Error in chat stream:', error)
    
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate response' })
    } else {
      res.write('data: [ERROR]\n\n')
      res.end()
    }
  }
}