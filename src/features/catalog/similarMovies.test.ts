import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import { checkGlobalBudget } from '../../lib/rateLimiter'
import { getOpenAIClient, isAiAvailable } from '../ai/openai'
import { getOrGenerateSimilarMovies } from './similarMovies'

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('../../lib/rateLimiter', () => ({ checkGlobalBudget: vi.fn() }))
vi.mock('../ai/openai', () => ({
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

const completion = (body: unknown) => ({
  choices: [{ message: { content: JSON.stringify(body) } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 }
})
const fakeClient = (body: unknown = { recommendations: [{ id: 9, reason: 'same moody tone' }] }) => ({
  chat: { completions: { create: vi.fn(async () => completion(body)) } }
})

const candidates = [
  { id: 9, title: 'Other Film', overview: 'x', poster_path: '/p.jpg', release_date: '2020-01-01' },
  { id: 10, title: 'Another', overview: 'y', poster_path: '/q.jpg', release_date: '2021-02-02' }
]
const args = { movieId: 42, title: 'Film', overview: 'An overview', genres: ['Drama'], candidates }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRedis).mockReturnValue(null)
  mockBudget.mockResolvedValue(true)
  mockAvailable.mockResolvedValue(true)
  mockClient.mockReturnValue(fakeClient() as never)
})

describe('getOrGenerateSimilarMovies', () => {
  it('returns empty when there are no candidates', async () => {
    const result = await getOrGenerateSimilarMovies({ ...args, candidates: [] })
    expect(result).toEqual([])
    expect(mockBudget).not.toHaveBeenCalled()
  })

  it('returns the provided cached value without generating', async () => {
    const cached = [{ id: 9, title: 'Other Film', posterPath: '/p.jpg', releaseDate: '2020-01-01', reason: 'r', mediaType: 'movie' as const }]
    const result = await getOrGenerateSimilarMovies({ ...args, cachedValue: cached })
    expect(result).toEqual(cached)
    expect(mockBudget).not.toHaveBeenCalled()
  })

  it('generates enriched picks on a cache miss', async () => {
    const result = await getOrGenerateSimilarMovies({ ...args, cachedValue: null })
    expect(result).toEqual([
      { id: 9, title: 'Other Film', posterPath: '/p.jpg', releaseDate: '2020-01-01', reason: 'same moody tone', mediaType: 'movie' }
    ])
    expect(mockBudget).toHaveBeenCalledWith('ai_similar', { maxRequests: 5, windowSeconds: 60 })
  })

  it('drops picks that are not in the candidate list', async () => {
    mockClient.mockReturnValue(fakeClient({ recommendations: [{ id: 999, reason: 'not a candidate' }] }) as never)
    const result = await getOrGenerateSimilarMovies({ ...args, cachedValue: null })
    expect(result).toEqual([])
  })

  it('uses a caller-provided budget bucket', async () => {
    await getOrGenerateSimilarMovies({ ...args, cachedValue: null, budget: { key: 'ai_warm', maxRequests: 200, windowSeconds: 3600 } })
    expect(mockBudget).toHaveBeenCalledWith('ai_warm', { maxRequests: 200, windowSeconds: 3600 })
  })

  it('returns empty when the global budget is tripped', async () => {
    mockBudget.mockResolvedValue(false)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await getOrGenerateSimilarMovies({ ...args, cachedValue: null })
    expect(result).toEqual([])
    warnSpy.mockRestore()
  })

  it('returns empty when the AI client is unavailable', async () => {
    mockClient.mockReturnValue(null as never)
    const result = await getOrGenerateSimilarMovies({ ...args, cachedValue: null })
    expect(result).toEqual([])
    expect(mockBudget).not.toHaveBeenCalled()
  })
})
