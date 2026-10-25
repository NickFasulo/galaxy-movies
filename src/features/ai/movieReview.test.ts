import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import { checkGlobalBudget } from '../../lib/rateLimiter'
import { getOpenAIClient, isAiAvailable } from './openai'
import { getOrGenerateMovieReview } from './movieReview'

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('../../lib/rateLimiter', () => ({ checkGlobalBudget: vi.fn() }))
vi.mock('./openai', () => ({
  getOpenAIClient: vi.fn(),
  isAiAvailable: vi.fn(),
  aiParams: vi.fn((_task: string, max: number, temp: number) => ({ model: 'test-model', max_completion_tokens: max, temperature: temp })),
  recordAiUsage: vi.fn(),
  isQuotaError: vi.fn(() => false),
  markAiUnavailable: vi.fn()
}))

const mockBudget = vi.mocked(checkGlobalBudget)
const mockClient = vi.mocked(getOpenAIClient)
const mockAvailable = vi.mocked(isAiAvailable)

const completion = (text: string | null) => ({
  choices: [{ message: { content: text } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 }
})
const fakeClient = (text: string | null = 'a generated review') => ({
  chat: { completions: { create: vi.fn(async () => completion(text)) } }
})

const args = { movieId: 42, title: 'Film', overview: 'An overview', genres: ['Drama'] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRedis).mockReturnValue(null)
  mockBudget.mockResolvedValue(true)
  mockAvailable.mockResolvedValue(true)
  mockClient.mockReturnValue(fakeClient() as never)
})

describe('getOrGenerateMovieReview', () => {
  it('returns the provided cached value without generating', async () => {
    const result = await getOrGenerateMovieReview({ ...args, cachedValue: 'cached review' })
    expect(result).toBe('cached review')
    expect(mockBudget).not.toHaveBeenCalled()
  })

  it('returns null when generation is disabled and the cache is empty', async () => {
    const result = await getOrGenerateMovieReview({ ...args, generate: false, cachedValue: null })
    expect(result).toBeNull()
  })

  it('generates and returns the review text on a cache miss', async () => {
    const result = await getOrGenerateMovieReview({ ...args, cachedValue: null })
    expect(result).toBe('a generated review')
    expect(mockBudget).toHaveBeenCalledWith('ai_review', { maxRequests: 5, windowSeconds: 60 })
  })

  it('uses a caller-provided budget bucket', async () => {
    await getOrGenerateMovieReview({ ...args, cachedValue: null, budget: { key: 'ai_warm', maxRequests: 200, windowSeconds: 3600 } })
    expect(mockBudget).toHaveBeenCalledWith('ai_warm', { maxRequests: 200, windowSeconds: 3600 })
  })

  it('returns null when the global budget is tripped', async () => {
    mockBudget.mockResolvedValue(false)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await getOrGenerateMovieReview({ ...args, cachedValue: null })
    expect(result).toBeNull()
    warnSpy.mockRestore()
  })

  it('returns null when the AI client is unavailable', async () => {
    mockClient.mockReturnValue(null as never)
    const result = await getOrGenerateMovieReview({ ...args, cachedValue: null })
    expect(result).toBeNull()
    expect(mockBudget).not.toHaveBeenCalled()
  })

  it('returns null when the completion has no content', async () => {
    mockClient.mockReturnValue(fakeClient(null) as never)
    const result = await getOrGenerateMovieReview({ ...args, cachedValue: null })
    expect(result).toBeNull()
  })
})

import { peekReviewCache, reviewCacheKey, stripEmphasis } from './movieReview'
import { isQuotaError, markAiUnavailable, recordAiUsage } from './openai'

const mockQuota = vi.mocked(isQuotaError)
const mockMarkDown = vi.mocked(markAiUnavailable)

describe('reviewCacheKey', () => {
  it('namespaces tv ids separately from movie ids', () => {
    expect(reviewCacheKey(5)).toBe('ai_review:v2:5')
    expect(reviewCacheKey(5, 'movie')).toBe('ai_review:v2:5')
    expect(reviewCacheKey(5, 'tv')).toBe('ai_review:v2:tv:5')
  })
})

describe('stripEmphasis', () => {
  it('strips single and double markdown emphasis', () => {
    expect(stripEmphasis('a *great* and **bold** pick')).toBe('a great and bold pick')
    expect(stripEmphasis('plain text')).toBe('plain text')
  })
})

describe('peekReviewCache', () => {
  it('reads the instance-local cache after a write', async () => {
    const result = await getOrGenerateMovieReview({
      movieId: 777001, title: 'Peek Film', overview: 'o', cachedValue: null
    })
    expect(result).toBe('a generated review')
    expect(peekReviewCache('ai_review:v2:777001')).toBe('a generated review')
  })

  it('returns null for an unwritten key', () => {
    expect(peekReviewCache('ai_review:v2:nope')).toBeNull()
  })
})

describe('getOrGenerateMovieReview edges', () => {
  it('returns null immediately when id, title, or overview is missing', async () => {
    expect(await getOrGenerateMovieReview({ movieId: 0, title: 'T', overview: 'o' })).toBeNull()
    expect(await getOrGenerateMovieReview({ movieId: 1, title: '', overview: 'o' })).toBeNull()
    expect(await getOrGenerateMovieReview({ movieId: 1, title: 'T', overview: '' })).toBeNull()
    expect(mockClient).not.toHaveBeenCalled()
  })

  it('backfills the memory cache when a cachedValue is provided', async () => {
    const key = reviewCacheKey(777002)
    const result = await getOrGenerateMovieReview({
      movieId: 777002, title: 'T', overview: 'o', cachedValue: 'provided review'
    })
    expect(result).toBe('provided review')
    expect(peekReviewCache(key)).toBe('provided review')
  })

  it('reads the Redis cache on a local miss and memoizes it locally', async () => {
    const kv = { get: vi.fn(async () => 'shared review'), set: vi.fn() }
    vi.mocked(getRedis).mockReturnValue(kv as unknown as ReturnType<typeof getRedis>)
    const result = await getOrGenerateMovieReview({ movieId: 777003, title: 'T', overview: 'o' })
    expect(result).toBe('shared review')
    expect(kv.get).toHaveBeenCalledWith('ai_review:v2:777003')
    expect(peekReviewCache('ai_review:v2:777003')).toBe('shared review')
    expect(mockClient).not.toHaveBeenCalled()
  })

  it('generates through a Redis read failure', async () => {
    const kv = { get: vi.fn(async () => { throw new Error('redis down') }), set: vi.fn(async () => 'OK') }
    vi.mocked(getRedis).mockReturnValue(kv as unknown as ReturnType<typeof getRedis>)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getOrGenerateMovieReview({ movieId: 777004, title: 'T', overview: 'o' })
    expect(result).toBe('a generated review')
    errSpy.mockRestore()
  })

  it('writes generated reviews to Redis with the year TTL', async () => {
    const kv = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') }
    vi.mocked(getRedis).mockReturnValue(kv as unknown as ReturnType<typeof getRedis>)
    await getOrGenerateMovieReview({ movieId: 777005, title: 'T', overview: 'o' })
    expect(kv.set).toHaveBeenCalledWith('ai_review:v2:777005', 'a generated review', { ex: 31536000 })
    expect(vi.mocked(recordAiUsage)).toHaveBeenCalledWith('review', { prompt_tokens: 10, completion_tokens: 5 }, expect.objectContaining({ latencyMs: expect.any(Number) }))
  })

  it('swallows a Redis write failure after a successful generation', async () => {
    const kv = { get: vi.fn(async () => null), set: vi.fn(async () => { throw new Error('write fail') }) }
    vi.mocked(getRedis).mockReturnValue(kv as unknown as ReturnType<typeof getRedis>)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getOrGenerateMovieReview({ movieId: 777006, title: 'T', overview: 'o' })
    expect(result).toBe('a generated review')
    errSpy.mockRestore()
  })

  it('records usage with latency and marks AI unavailable on a quota error', async () => {
    const client = fakeClient()
    const quota = new Error('insufficient_quota')
    client.chat.completions.create.mockRejectedValueOnce(quota)
    mockClient.mockReturnValue(client as never)
    mockQuota.mockImplementation((err) => err === quota)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getOrGenerateMovieReview({ movieId: 777007, title: 'T', overview: 'o' })
    expect(result).toBeNull()
    expect(mockMarkDown).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('does not mark AI unavailable on a non-quota failure', async () => {
    const client = fakeClient()
    client.chat.completions.create.mockRejectedValueOnce(new Error('server 500'))
    mockClient.mockReturnValue(client as never)
    mockQuota.mockReturnValue(false)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await getOrGenerateMovieReview({ movieId: 777008, title: 'T', overview: 'o' })
    expect(mockMarkDown).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('returns null when isAiAvailable is false and skips the budget check', async () => {
    mockAvailable.mockResolvedValueOnce(false)
    const result = await getOrGenerateMovieReview({ movieId: 777009, title: 'T', overview: 'o' })
    expect(result).toBeNull()
    expect(mockBudget).not.toHaveBeenCalled()
  })

  it('uses the tv-namespaced cache key for tv reviews', async () => {
    const kv = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') }
    vi.mocked(getRedis).mockReturnValue(kv as unknown as ReturnType<typeof getRedis>)
    await getOrGenerateMovieReview({ movieId: 777010, title: 'T', overview: 'o', mediaType: 'tv' })
    expect(kv.get).toHaveBeenCalledWith('ai_review:v2:tv:777010')
    expect(kv.set).toHaveBeenCalledWith('ai_review:v2:tv:777010', expect.any(String), expect.anything())
  })
})
