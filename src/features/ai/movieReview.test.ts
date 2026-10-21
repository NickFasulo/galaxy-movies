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
