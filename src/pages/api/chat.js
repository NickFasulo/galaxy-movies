import OpenAI from 'openai'
import { LRUCache } from 'lru-cache'
import { Redis } from '@upstash/redis'

let openai
let redis

const chatCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 30 })

const localRequestLimits = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 })

const MAX_REQUESTS_PER_HOUR = 20
const MAX_CONVERSATION_LENGTH = 10
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb'
    }
  }
}

function getRedis() {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_KV_REST_API_URL || !process.env.UPSTASH_REDIS_KV_REST_API_TOKEN) {
    return null
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN,
  })
  return redis
}

function getClientIdentifier(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0])?.trim()
    || req.socket.remoteAddress
    || 'unknown'
}

async function checkRateLimit(clientId) {
  const kv = getRedis()

  if (kv) {
    try {
      const key = `chat_rl:${clientId}`
      const count = await kv.incr(key)
      if (count === 1) {
        await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS)
      }
      return count <= MAX_REQUESTS_PER_HOUR
    } catch (err) {
      console.error('Redis rate limit error, failing open:', err)
      return true
    }
  }

  const count = (localRequestLimits.get(clientId) || 0) + 1
  localRequestLimits.set(clientId, count)
  return count <= MAX_REQUESTS_PER_HOUR
}

function getConversationCacheKey(messages) {
  const lastMessage = messages[messages.length - 1]
  return `chat:${lastMessage.role}:${lastMessage.content.substring(0, 50)}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const { messages = [] } = req.body

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' })
  }

  const lastMessage = messages[messages.length - 1]
  if (!lastMessage || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
    return res.status(400).json({ error: 'Valid message content is required' })
  }

  if (lastMessage.content.length > 500) {
    return res.status(400).json({ error: 'Message content too long (max 500 characters)' })
  }

  const clientId = getClientIdentifier(req)
  const allowed = await checkRateLimit(clientId)
  if (!allowed) {
    res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_SECONDS))
    return res.status(429).json({ error: 'Chat request limit reached. Please try again later.' })
  }

  const cacheKey = getConversationCacheKey(messages)
  const cachedResponse = chatCache.get(cacheKey)
  if (cachedResponse) {
    return res.status(200).json({ response: cachedResponse, cached: true })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI chat is temporarily unavailable.' })
  }

  try {
    openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const limitedMessages = messages.slice(-MAX_CONVERSATION_LENGTH)
    
    const systemMessage = {
      role: 'system',
      content: `You are a helpful movie discovery assistant for Galaxy Movies. Your goal is to help users find movies they'll enjoy based on their preferences, mood, or specific criteria.

Key capabilities:
- Recommend movies based on genre, mood, time period, actors, directors, or themes
- Consider streaming platform availability when making recommendations
- Help users decide what to watch when they're experiencing choice paralysis
- Provide context about why a movie might be a good fit
- Suggest alternatives if a user has already seen a recommendation

Guidelines:
- Be concise and direct in your responses
- Focus on practical recommendations
- Ask clarifying questions when needed to understand preferences
- Consider the user's stated preferences and previous context
- Provide 2-3 specific movie recommendations with brief justifications
- If mentioning streaming platforms, note that availability varies by region

When users ask about group decision making:
- Help identify common ground between different preferences
- Suggest movies that might appeal to multiple tastes
- Consider compromise options that balance different group members' interests

Keep responses conversational but focused on actionable movie recommendations.`
    }

    const allMessages = [systemMessage, ...limitedMessages]

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: allMessages,
      max_tokens: 300,
      temperature: 0.7,
      stream: true
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

    res.write('data: [DONE]\n\n')
    res.end()

    if (fullResponse.trim()) {
      chatCache.set(cacheKey, fullResponse)
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