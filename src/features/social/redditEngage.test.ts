import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProviderChanges: vi.fn(),
  kv: {
    get: vi.fn(async () => null as string | null),
    set: vi.fn(async () => 'OK'),
    hget: vi.fn(async () => null),
    hset: vi.fn(async () => 1),
    expire: vi.fn(async () => 1)
  }
}))

vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: mocks.getProviderChanges
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => mocks.kv }))

import { buildProviderEngagePost, engageProviderForWeek, runRedditEngage } from './redditEngage'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
afterAll(() => fetchSpy.mockRestore())

const ENGAGE_ENVS = [
  'REDDIT_ENGAGE_MODE', 'REDDIT_ENGAGE_EMAIL', 'INDEXING_REPORT_EMAIL', 'RESEND_API_KEY',
  'REDDIT_ENGAGE_CLIENT_ID', 'REDDIT_ENGAGE_CLIENT_SECRET', 'REDDIT_ENGAGE_USERNAME', 'REDDIT_ENGAGE_PASSWORD'
]
const clearEngageEnv = () => ENGAGE_ENVS.forEach((k) => delete process.env[k])

const netflixChange = {
  added: [{ title: 'Frankenstein' }, { title: 'The Rip' }],
  left: [{ title: 'Old Show' }],
  coming: [{ title: 'New Thing', date: '2026-11-20' }],
  leavingSoon: [{ title: 'Gone Soon', date: '2026-11-15' }]
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.clearAllMocks()
  clearEngageEnv()
  mocks.kv.get.mockResolvedValue(null)
  mocks.getProviderChanges.mockResolvedValue({ netflix: netflixChange })
})

describe('buildProviderEngagePost', () => {
  it('renders all four sections without a site link by default', () => {
    const { title, text } = buildProviderEngagePost('netflix', netflixChange)
    expect(title).toContain('Netflix')
    expect(text).toContain('**Added:** Frankenstein, The Rip')
    expect(text).toContain('**Left:** Old Show')
    expect(text).toContain('**Leaving soon:** Gone Soon (Nov 15)')
    expect(text).toContain('**Coming soon:** New Thing (Nov 20)')
    expect(text).not.toContain('galaxymovies.app')
  })

  it('appends the deep link only when the sub allows it', () => {
    const { text } = buildProviderEngagePost('netflix', netflixChange, { link: true })
    expect(text).toContain('galaxymovies.app/leaving/netflix')
  })

  it('returns empty text when the provider has no changes', () => {
    expect(buildProviderEngagePost('hulu', {}).text).toBe('')
  })
})

describe('engageProviderForWeek', () => {
  it('rotates providers by ISO week and never leaves the map', () => {
    const seen = new Set<string>()
    for (let w = 0; w < 12; w++) {
      const p = engageProviderForWeek(new Date(Date.UTC(2026, 0, 5 + w * 7)))
      expect(typeof p).toBe('string')
      seen.add(p)
    }
    expect(seen.size).toBeGreaterThan(3)
  })
})

describe('runRedditEngage draft mode', () => {
  beforeEach(() => {
    process.env.REDDIT_ENGAGE_EMAIL = 'nick@example.com'
    process.env.RESEND_API_KEY = 'key'
  })

  const targetWeek = () => {
    // Find the week that picks netflix so mocks stay single-provider.
    for (let i = 0; i < 52; i++) {
      const d = new Date(Date.UTC(2026, 0, 5 + i * 7))
      if (engageProviderForWeek(d) === 'netflix') return d
    }
    throw new Error('no netflix week')
  }

  it('emails the draft instead of hitting reddit', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))

    const result = await runRedditEngage(targetWeek())
    expect(result.status).toBe('emailed')
    expect(result.sub).toBe('NetflixBestOf')
    expect(result.mode).toBe('draft')

    const resend = fetchSpy.mock.calls.find(([input]) => String(input).includes('api.resend.com'))
    expect(resend).toBeDefined()
    const body = JSON.parse(String(resend![1]?.body))
    expect(body.to).toBe('nick@example.com')
    expect(body.subject).toContain('r/NetflixBestOf')
    expect(body.html).toContain('Frankenstein')
    // never touches reddit in draft mode
    expect(fetchSpy.mock.calls.find(([input]) => String(input).includes('reddit.com'))).toBeUndefined()
  })

  it('dedupes on identical content', async () => {
    mocks.kv.get.mockResolvedValue('x')
    // Make the stored value match the built text.
    const { text } = buildProviderEngagePost('netflix', netflixChange)
    mocks.kv.get.mockResolvedValue(text)

    const result = await runRedditEngage(targetWeek())
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('already posted')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('runRedditEngage post mode', () => {
  beforeEach(() => {
    process.env.REDDIT_ENGAGE_MODE = 'post'
    process.env.REDDIT_ENGAGE_CLIENT_ID = 'id'
    process.env.REDDIT_ENGAGE_CLIENT_SECRET = 'secret'
    process.env.REDDIT_ENGAGE_USERNAME = 'alt'
    process.env.REDDIT_ENGAGE_PASSWORD = 'pass'
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes('access_token')
        ? new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
        : new Response('{}', { status: 200 })
    )
  })

  it('submits a self post to the rotated sub', async () => {
    const now = new Date(Date.UTC(2026, 0, 5))
    const provider = engageProviderForWeek(now)
    mocks.getProviderChanges.mockResolvedValue({ [provider]: netflixChange })

    const result = await runRedditEngage(now)
    expect(result.status).toBe('posted')
    const submit = fetchSpy.mock.calls.find(([input]) => String(input).includes('oauth.reddit.com/api/submit'))
    expect(submit).toBeDefined()
    const body = new URLSearchParams(String(submit![1]?.body))
    expect(body.get('kind')).toBe('self')
    expect(body.get('text')).not.toContain('galaxymovies.app')
  })

  it('skips when the provider week has no changes', async () => {
    const now = new Date(Date.UTC(2026, 0, 5))
    const provider = engageProviderForWeek(now)
    mocks.getProviderChanges.mockResolvedValue({ [provider]: { added: [], left: [], coming: [], leavingSoon: [] } })

    const result = await runRedditEngage(now)
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('nothing to post')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
