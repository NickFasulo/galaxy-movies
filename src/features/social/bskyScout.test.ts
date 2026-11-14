import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import type { ProviderChanges } from '../catalog/streamingChanges'

const mocks = vi.hoisted(() => ({
  getProviderChanges: vi.fn(async (): Promise<Record<string, ProviderChanges>> => ({})),
  kv: {
    get: vi.fn<(key: string) => Promise<string | null>>(async () => null),
    set: vi.fn<(key: string, val: string, opts?: unknown) => Promise<string>>(async () => 'OK'),
    smembers: vi.fn<(key: string) => Promise<string[]>>(async () => []),
    sadd: vi.fn<(key: string, ...members: string[]) => Promise<number>>(async () => 1),
    expire: vi.fn<(key: string, secs: number) => Promise<number>>(async () => 1),
    hset: vi.fn<(key: string, fields: Record<string, string>) => Promise<number>>(async () => 1),
    hget: vi.fn<(key: string, field: string) => Promise<null>>(async () => null)
  }
}))
vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: mocks.getProviderChanges,
  getMonthlyChanges: vi.fn(async () => ({}))
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => mocks.kv }))

import { draftReply, matchIntent, matchProvider, postUrl, runBskyScout } from './bskyScout'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
afterAll(() => fetchSpy.mockRestore())

const ENVS = ['RESEND_API_KEY', 'REDDIT_ENGAGE_EMAIL', 'INDEXING_REPORT_EMAIL', 'BSKY_HANDLE', 'BSKY_APP_PASSWORD']
const clearEnv = () => ENVS.forEach((k) => delete process.env[k])

const post = (over: Record<string, unknown> = {}) => ({
  uri: 'at://did:plc:abc/app.bsky.feed.post/3xyz',
  author: { handle: 'filmfan.bsky.social' },
  record: { text: 'what is leaving netflix this month?' },
  likeCount: 12,
  replyCount: 2,
  ...over
})

const searchOk = (posts: unknown[]) =>
  new Response(JSON.stringify({ posts }), { status: 200 })

const changesFixture: Record<string, ProviderChanges> = {
  netflix: {
    source: 'test',
    updatedAt: 0,
    added: [
      { tmdbId: 1, tmdbType: 'movie', title: 'Frankenstein', year: 2026 },
      { tmdbId: 2, tmdbType: 'movie', title: 'The Rip', year: 2026 }
    ],
    left: [],
    coming: [],
    leavingSoon: [
      { tmdbId: 3, tmdbType: 'movie', title: 'Gone Soon', date: '2026-11-20', season: null, popularity: 80 },
      { tmdbId: 4, tmdbType: 'movie', title: 'Also Gone', date: '2026-11-25', season: null, popularity: 40 }
    ]
  }
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.clearAllMocks()
  clearEnv()
  mocks.kv.get.mockResolvedValue(null)
  mocks.kv.smembers.mockResolvedValue([])
  mocks.getProviderChanges.mockResolvedValue(changesFixture)
})

describe('matchProvider', () => {
  it('maps platform names to provider keys', () => {
    expect(matchProvider('leaving netflix soon')).toBe('netflix')
    expect(matchProvider('gone from Hulu')).toBe('hulu')
    expect(matchProvider('leaving hbo max')).toBe('max')
    expect(matchProvider('leaving disney+')).toBe('disney-plus')
    expect(matchProvider('leaving disney plus')).toBe('disney-plus')
    expect(matchProvider('leaving prime video')).toBe('amazon-prime-video')
    expect(matchProvider('leaving apple tv')).toBe('apple-tv')
  })

  it('does not match max inside maximum and misses unknown providers', () => {
    expect(matchProvider('maximum effort')).toBeNull()
    expect(matchProvider('leaving peacock')).toBeNull()
  })
})

describe('matchIntent', () => {
  it('resolves leaving before watch intent', () => {
    expect(matchIntent('what should i watch before it leaves netflix')).toBe('leaving')
    expect(matchIntent('what to watch tonight')).toBe('watch')
    expect(matchIntent('where can i watch dune')).toBe('where')
    expect(matchIntent('hello bsky')).toBeNull()
  })
})

describe('postUrl', () => {
  it('maps an at:// uri to the bsky.app permalink', () => {
    expect(postUrl('filmfan.bsky.social', 'at://did:plc:x/app.bsky.feed.post/3abc')).toBe(
      'https://bsky.app/profile/filmfan.bsky.social/post/3abc'
    )
  })
})

describe('draftReply', () => {
  it('drafts a leaving reply with dated titles and a provider link', () => {
    const text = draftReply('leaving', 'netflix', changesFixture)
    expect(text).toContain('Also leaving Netflix this month:')
    expect(text).toContain('Gone Soon (Nov 20)')
    expect(text).toContain('galaxymovies.app/leaving/netflix')
    expect(text.length).toBeLessThanOrEqual(300)
  })

  it('uses the generic /leaving link when no provider matched', () => {
    const text = draftReply('leaving', null, changesFixture)
    expect(text).toContain('Also leaving streaming this month:')
    expect(text.endsWith('galaxymovies.app/leaving')).toBe(true)
    expect(text).not.toContain('/leaving/netflix')
  })

  it('drafts a watch reply from added titles', () => {
    const text = draftReply('watch', 'netflix', changesFixture)
    expect(text).toContain('New on Netflix this week: Frankenstein, The Rip')
  })

  it('sheds titles to fit 300 chars and returns empty when nothing fits', () => {
    const longTitle = 'A'.repeat(120)
    const long: Record<string, ProviderChanges> = {
      netflix: {
        source: 't', updatedAt: 0,
        added: [
          { tmdbId: 1, tmdbType: 'movie', title: longTitle, year: 2026 },
          { tmdbId: 2, tmdbType: 'movie', title: longTitle, year: 2026 },
          { tmdbId: 3, tmdbType: 'movie', title: longTitle, year: 2026 }
        ],
        left: [], coming: []
      }
    }
    const text = draftReply('watch', 'netflix', long)
    expect(text.length).toBeLessThanOrEqual(300)
    expect(text).toContain(longTitle)

    const empty: Record<string, ProviderChanges> = {
      netflix: { source: 't', updatedAt: 0, added: [], left: [], coming: [], leavingSoon: [] }
    }
    expect(draftReply('leaving', 'netflix', empty)).toBe('')
    expect(draftReply('watch', 'netflix', empty)).toBe('')
  })
})

describe('runBskyScout', () => {
  const searchUrl = (call: [unknown, unknown?]) => String(call[0])
  const searchCalls = () => fetchSpy.mock.calls.filter((c) => searchUrl(c).includes('app.bsky.feed.searchPosts'))
  const resendCalls = () => fetchSpy.mock.calls.filter((c) => searchUrl(c).includes('api.resend.com'))

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.REDDIT_ENGAGE_EMAIL = 'nick@example.com'
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes('api.resend.com')
        ? new Response('{}', { status: 200 })
        : searchOk([post()])
    )
  })

  it('emails drafted replies with quoted posts and bsky.app links', async () => {
    const result = await runBskyScout(new Date('2026-11-13T16:00:00Z'))
    expect(result.status).toBe('emailed')
    expect(result.drafted).toBe(1)
    expect(result.scanned).toBeGreaterThan(0)

    const body = JSON.parse(String(resendCalls()[0]?.[1]?.body))
    expect(body.to).toBe('nick@example.com')
    expect(body.subject).toContain('BSKY reply drafts')
    expect(body.html).toContain('what is leaving netflix')
    expect(body.html).toContain('@filmfan.bsky.social')
    expect(body.html).toContain('bsky.app/profile/filmfan.bsky.social/post/3xyz')
    expect(body.html).toContain('Also leaving Netflix this month')
    expect(mocks.kv.sadd).toHaveBeenCalledWith('gm:social:bsky-scout:seen', 'at://did:plc:abc/app.bsky.feed.post/3xyz')
    expect(mocks.kv.expire).toHaveBeenCalledWith('gm:social:bsky-scout:seen', expect.any(Number))
    // run outcome recorded for the indexing-report Social block
    expect(mocks.kv.hset).toHaveBeenCalledWith('gm:social:last-result:bsky-scout', expect.objectContaining({ status: 'emailed' }))
  })

  it('filters own posts, saturated threads, labelled posts, and seen uris', async () => {
    mocks.kv.smembers.mockResolvedValue(['at://did:plc:abc/app.bsky.feed.post/seen1'])
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes('api.resend.com')
        ? new Response('{}', { status: 200 })
        : searchOk([
            post({ uri: 'at://did:plc:a/app.bsky.feed.post/own1', author: { handle: 'galaxymovies.app' } }),
            post({ uri: 'at://did:plc:b/app.bsky.feed.post/sat1', replyCount: 40 }),
            post({ uri: 'at://did:plc:c/app.bsky.feed.post/lab1', labels: [{ val: 'porn' }] }),
            post({ uri: 'at://did:plc:abc/app.bsky.feed.post/seen1' })
          ])
    )
    const result = await runBskyScout()
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('no candidates')
    expect(resendCalls()).toHaveLength(0)
  })

  it('counts where-to-watch posts as needs-lookup instead of drafting', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes('api.resend.com')
        ? new Response('{}', { status: 200 })
        : searchOk([
            post({ uri: 'at://did:plc:a/app.bsky.feed.post/w1', record: { text: 'where can i watch dune' } }),
            post()
          ])
    )
    const result = await runBskyScout()
    expect(result.status).toBe('emailed')
    expect(result.drafted).toBe(1)
    expect(result.needsLookup).toBe(1)
    const body = JSON.parse(String(resendCalls()[0]?.[1]?.body))
    expect(body.html).toContain('skipped: needs title lookup')
  })

  it('skips the email when the identical draft set was already sent', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes('api.resend.com')
        ? new Response('{}', { status: 200 })
        : searchOk([post()])
    )
    await runBskyScout(new Date('2026-11-13T16:00:00Z'))
    const lastBody = String(mocks.kv.set.mock.calls.find(([k]) => k === 'gm:social:bsky-scout:last')?.[1])
    mocks.kv.get.mockImplementation(async (key) => (key === 'gm:social:bsky-scout:last' ? lastBody : null))

    const result = await runBskyScout(new Date('2026-11-14T16:00:00Z'))
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('already sent')
    expect(resendCalls()).toHaveLength(1) // only the first run's email
  })

  it('skips without an email target and records the outcome', async () => {
    delete process.env.RESEND_API_KEY
    const result = await runBskyScout()
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('no email target')
    expect(resendCalls()).toHaveLength(0)
    expect(mocks.kv.hset).toHaveBeenCalledWith('gm:social:last-result:bsky-scout', expect.objectContaining({ status: 'skipped' }))
  })

  it('falls back to an authed bsky.social session when the public endpoint 4xxs', async () => {
    process.env.BSKY_HANDLE = 'galaxymovies.app'
    process.env.BSKY_APP_PASSWORD = 'pass'
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('api.resend.com')) return new Response('{}', { status: 200 })
      if (url.includes('public.api.bsky.app')) return new Response('rate limited', { status: 429 })
      if (url.includes('createSession')) return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'd' }), { status: 200 })
      if (url.includes('bsky.social/xrpc/app.bsky.feed.searchPosts')) return searchOk([post()])
      return new Response('{}', { status: 200 })
    })
    const result = await runBskyScout()
    expect(result.status).toBe('emailed')
    const authed = searchCalls().filter((c) => String(c[0]).includes('bsky.social'))
    expect(authed.length).toBeGreaterThan(0)
    expect((authed[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jwt' })
  })
})
