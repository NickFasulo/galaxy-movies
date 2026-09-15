import OpenAI from 'openai'
import { createHash } from 'crypto'
import { LRUCache } from 'lru-cache'

let openai
const reviewCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 * 24 })
const requestLimits = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 })
const MAX_REQUESTS_PER_HOUR = 5
const MAX_TEXT_LENGTH = 1200

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8kb'
    }
  }
}

function getClientIdentifier(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0])?.trim()
    || req.socket.remoteAddress
    || 'unknown'
}

function getReviewKey(modalData) {
  return createHash('sha256')
    .update(JSON.stringify({
      title: modalData.title,
      overview: modalData.overview,
      genres: modalData.genres
    }))
    .digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const modalData = req.body?.modalData
  const genres = Array.isArray(modalData?.genres)
    ? modalData.genres.map(genre => genre?.name).filter(Boolean).slice(0, 5)
    : []

  if (
    typeof modalData?.title !== 'string'
    || typeof modalData?.overview !== 'string'
    || !modalData.title.trim()
    || !modalData.overview.trim()
    || modalData.title.length > 200
    || modalData.overview.length > MAX_TEXT_LENGTH
  ) {
    return res.status(400).json({ error: 'A valid movie title and overview are required' })
  }

  const clientId = getClientIdentifier(req)
  const requestCount = requestLimits.get(clientId) || 0
  if (requestCount >= MAX_REQUESTS_PER_HOUR) {
    res.setHeader('Retry-After', '3600')
    return res.status(429).json({ error: 'Review request limit reached. Please try again later.' })
  }

  const reviewKey = getReviewKey(modalData)
  const cachedReview = reviewCache.get(reviewKey)
  if (cachedReview) {
    return res.status(200).json({ review: cachedReview, cached: true })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI reviews are temporarily unavailable.' })
  }

  requestLimits.set(clientId, requestCount + 1)

  try {
    openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const review = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 350,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            'Write a concise, spoiler-free, clearly subjective movie recommendation. Do not invent facts or claim to be a professional critic.'
        },
        {
          role: 'user',
          content: `Give a short review of the ${genres.join(', ') || 'movie'} "${modalData.title}" based only on this overview. Include who may enjoy it and one potential drawback: ${modalData.overview}`
        }
      ]
    })
    const reviewText = review.choices[0]?.message?.content?.trim()
    if (!reviewText) {
      throw new Error('OpenAI returned an empty review')
    }

    reviewCache.set(reviewKey, reviewText)
    return res.status(200).json({ review: reviewText, cached: false })
  } catch (error) {
    console.error('Error generating review:', error)
    return res.status(500).json({ error: 'Failed to generate review' })
  }
}
