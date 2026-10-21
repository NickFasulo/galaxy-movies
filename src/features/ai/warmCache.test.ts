import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchTmdb } from '../catalog/tmdb'
import { getOrGenerateMovieReview } from './movieReview'
import { getOrGenerateSimilarMovies } from '../catalog/similarMovies'
import { warmAiTitleCache } from './warmCache'

vi.mock('../catalog/tmdb', () => ({
  fetchTmdb: vi.fn(),
  normalizeTvTitle: (show: { name?: string; first_air_date?: string }) => ({
    ...show,
    title: show.name,
    release_date: show.first_air_date,
    mediaType: 'tv'
  })
}))
vi.mock('./movieReview', () => ({ getOrGenerateMovieReview: vi.fn() }))
vi.mock('../catalog/similarMovies', () => ({ getOrGenerateSimilarMovies: vi.fn() }))

const mockTmdb = vi.mocked(fetchTmdb)
const mockReview = vi.mocked(getOrGenerateMovieReview)
const mockSimilar = vi.mocked(getOrGenerateSimilarMovies)

const detail = (overrides: Record<string, unknown> = {}) => ({
  overview: 'A film overview',
  genres: [{ name: 'Drama' }],
  recommendations: { results: [{ id: 9, title: 'Other', overview: 'x', poster_path: '/p.jpg', release_date: '2020-01-01' }] },
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
  mockTmdb.mockResolvedValue(detail() as never)
  mockReview.mockResolvedValue('generated review')
  mockSimilar.mockResolvedValue([])
})

describe('warmAiTitleCache', () => {
  it('generates review and similar picks under the ai_warm budget', async () => {
    const warmed = await warmAiTitleCache([{ id: 1, mediaType: 'movie', title: 'Film' }])
    expect(warmed).toBe(1)
    expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({
      movieId: 1, title: 'Film', mediaType: 'movie',
      budget: { key: 'ai_warm', maxRequests: 200, windowSeconds: 3600 }
    }))
    expect(mockSimilar).toHaveBeenCalledWith(expect.objectContaining({
      movieId: 1, budget: { key: 'ai_warm', maxRequests: 200, windowSeconds: 3600 }
    }))
    expect(mockTmdb).toHaveBeenCalledWith('/movie/1', { append_to_response: 'recommendations' })
  })

  it('dedupes candidates and sorts by popularity descending', async () => {
    await warmAiTitleCache([
      { id: 1, mediaType: 'movie', title: 'Low', popularity: 1 },
      { id: 1, mediaType: 'movie', title: 'Low', popularity: 1 },
      { id: 2, mediaType: 'movie', title: 'High', popularity: 99 }
    ])
    expect(mockTmdb).toHaveBeenCalledTimes(2)
    expect(mockTmdb).toHaveBeenNthCalledWith(1, '/movie/2', expect.anything())
    expect(mockTmdb).toHaveBeenNthCalledWith(2, '/movie/1', expect.anything())
  })

  it('skips generation when the title has no overview', async () => {
    mockTmdb.mockResolvedValue(detail({ overview: '' }) as never)
    const warmed = await warmAiTitleCache([{ id: 1, mediaType: 'movie', title: 'Film' }])
    expect(warmed).toBe(0)
    expect(mockReview).not.toHaveBeenCalled()
    expect(mockSimilar).not.toHaveBeenCalled()
  })

  it('skips similar generation when there are no recommendations', async () => {
    mockTmdb.mockResolvedValue(detail({ recommendations: { results: [] } }) as never)
    const warmed = await warmAiTitleCache([{ id: 1, mediaType: 'movie', title: 'Film' }])
    expect(warmed).toBe(1)
    expect(mockReview).toHaveBeenCalledOnce()
    expect(mockSimilar).not.toHaveBeenCalled()
  })

  it('normalizes tv recommendation candidates before generating', async () => {
    mockTmdb.mockResolvedValue(detail({
      recommendations: { results: [{ id: 9, name: 'Show', overview: 'x', poster_path: '/p.jpg', first_air_date: '2021-05-05' }] }
    }) as never)
    await warmAiTitleCache([{ id: 7, mediaType: 'tv', title: 'Series' }])
    expect(mockTmdb).toHaveBeenCalledWith('/tv/7', expect.anything())
    expect(mockSimilar).toHaveBeenCalledWith(expect.objectContaining({
      candidates: [expect.objectContaining({ id: 9, title: 'Show', release_date: '2021-05-05' })]
    }))
  })

  it('keeps going when a detail fetch fails', async () => {
    mockTmdb
      .mockRejectedValueOnce(new Error('tmdb down') as never)
      .mockResolvedValue(detail() as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warmed = await warmAiTitleCache([
      { id: 1, mediaType: 'movie', title: 'Bad', popularity: 50 },
      { id: 2, mediaType: 'movie', title: 'Good' }
    ])
    expect(warmed).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('AI cache warm failed for movie:1:', expect.any(Error))
    errorSpy.mockRestore()
  })

  it('caps the warm batch at 60 titles', async () => {
    const candidates = Array.from({ length: 75 }, (_, i) => ({ id: i + 1, mediaType: 'movie' as const, title: `T${i}` }))
    await warmAiTitleCache(candidates)
    expect(mockTmdb).toHaveBeenCalledTimes(60)
  })
})
