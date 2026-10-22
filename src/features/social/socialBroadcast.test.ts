import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

vi.mock('../../lib/redis', () => ({ getRedis: () => null }))
vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: () =>
    Promise.resolve({ netflix: { added: items(['Frankenstein']), left: items(['Old Show']), coming: [] } })
}))

import { buildBroadcastPost, buildRedditDigest, broadcastWeeklyDigest } from './socialBroadcast'

const items = (titles: string[]) => titles.map((title) => ({ title }))

describe('buildBroadcastPost', () => {
  it('lists top adds and leaves per provider with the site link', () => {
    const text = buildBroadcastPost({
      netflix: { added: items(['Frankenstein', 'The Rip']), left: items(['Old Show']), coming: items([]) },
      hulu: { added: items(['Hulu Movie']), left: items([]), coming: items([]) },
      max: { added: items([]), left: items(['Max Movie']), coming: items([]) }
    })
    expect(text).toContain('+ Frankenstein → Netflix')
    expect(text).toContain('− Old Show ← Netflix')
    expect(text).toContain('+ Hulu Movie → Hulu')
    expect(text).toContain('− Max Movie ← Max')
    expect(text).toContain('galaxymovies.app/leaving')
    expect(text.length).toBeLessThanOrEqual(300)
  })

  it('drops lines until the post fits the 300 char cap', () => {
    const long = Array.from({ length: 40 }, (_, i) => `A Very Long Title Indeed Number ${i + 1}`)
    const text = buildBroadcastPost({
      netflix: { added: items(long), left: items(long), coming: items([]) },
      hulu: { added: items(long), left: items(long), coming: items([]) },
      max: { added: items(long), left: items(long), coming: items([]) }
    })
    expect(text.length).toBeLessThanOrEqual(300)
    expect(text).toContain('galaxymovies.app/leaving')
  })

  it('handles empty diffs', () => {
    const text = buildBroadcastPost({})
    expect(text).toContain('streaming moves')
    expect(text.length).toBeLessThanOrEqual(300)
  })
})

describe('buildRedditDigest', () => {
  const changes = {
    netflix: {
      added: items(['Frankenstein', 'The Rip']),
      left: items(['Old Show']),
      coming: [{ title: 'New Thing', date: '2026-10-30' }],
      leavingSoon: [{ title: 'Gone Soon', date: '2026-10-28' }]
    },
    hulu: { added: items(['Hulu Movie']), left: items([]), coming: [] },
    max: { added: items([]), left: items(['Max Movie']), coming: [] }
  }

  it('groups titles under provider sections in requested order', () => {
    const text = buildRedditDigest(changes, ['hulu', 'netflix', 'max'], 10000)
    expect(text.indexOf('**Hulu**')).toBeLessThan(text.indexOf('**Netflix**'))
    expect(text).toContain('- Added: Frankenstein, The Rip')
    expect(text).toContain('- Removed: Old Show')
    expect(text).toContain('New Thing (Oct 30)')
    expect(text).toContain('Gone Soon (Oct 28)')
    expect(text).toContain('- Removed: Max Movie')
    expect(text).toContain('galaxymovies.app/leaving')
  })

  it('skips providers with no diff data', () => {
    const text = buildRedditDigest(changes, ['netflix', 'peacock'], 10000)
    expect(text).toContain('**Netflix**')
    expect(text).not.toContain('**Peacock**')
  })

  it('trims whole lines until the post fits without an orphaned header', () => {
    const long = Array.from({ length: 40 }, (_, i) => `A Very Long Title Indeed Number ${i + 1}`)
    const big = {
      netflix: { added: items(long), left: items(long), coming: [] },
      hulu: { added: items(long), left: items(long), coming: [] },
      max: { added: items(long), left: items(long), coming: [] }
    }
    const text = buildRedditDigest(big, ['netflix', 'hulu', 'max'], 1200)
    expect(text.length).toBeLessThanOrEqual(1200)
    expect(text).toContain('galaxymovies.app/leaving')
    const content = text.split('Full lists updated daily')[0].trimEnd()
    expect(content.endsWith('**')).toBe(false)
  })
})

describe('broadcastWeeklyDigest', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    fetchSpy.mockReset()
    delete process.env.BSKY_HANDLE
    delete process.env.BSKY_APP_PASSWORD
    delete process.env.FB_PAGE_ID
    delete process.env.FB_PAGE_ACCESS_TOKEN
    delete process.env.SOCIAL_FACEBOOK_WEBHOOK
  })

  afterAll(() => fetchSpy.mockRestore())

  it('skips every channel when no credentials are set', async () => {
    const results = await broadcastWeeklyDigest()
    expect(Object.keys(results).length).toBeGreaterThan(1)
    for (const r of Object.values(results)) expect(r.status).toBe('skipped')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts only to configured channels', async () => {
    process.env.BSKY_HANDLE = 'galaxymovies.app'
    process.env.BSKY_APP_PASSWORD = 'test-pass'
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ accessJwt: 'jwt', did: 'did:plc:1' }), { status: 200 }))

    const results = await broadcastWeeklyDigest()
    expect(results.bsky.status).toBe('posted')
    expect(results.discord.status).toBe('skipped')
    // login + createRecord
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[1][0]).toContain('createRecord')
  })

  it('reports a failed channel without blocking the others', async () => {
    process.env.BSKY_HANDLE = 'galaxymovies.app'
    process.env.BSKY_APP_PASSWORD = 'test-pass'
    process.env.SOCIAL_DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/token'
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('createSession')) return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'd' }), { status: 200 })
      if (url.includes('createRecord')) return new Response('oops', { status: 500 })
      return new Response('{}', { status: 200 })
    })

    const results = await broadcastWeeklyDigest()
    expect(results.bsky.status).toBe('failed')
    expect(results.discord.status).toBe('posted')
  })

  it('posts {message, link} JSON to the facebook webhook when no page token is set', async () => {
    process.env.SOCIAL_FACEBOOK_WEBHOOK = 'https://hook.us1.make.com/abc'
    fetchSpy.mockResolvedValue(new Response('Accepted', { status: 200 }))

    const results = await broadcastWeeklyDigest()
    expect(results.facebook.status).toBe('posted')
    const fbCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('hook.us1.make.com'))
    expect(fbCall).toBeDefined()
    const body = JSON.parse(String(fbCall![1]?.body))
    expect(body.message).toContain('galaxymovies.app/leaving')
    expect(body.link).toContain('galaxymovies.app/leaving')
  })

  it('posts to the facebook page with the token in the form body, not the URL', async () => {
    process.env.FB_PAGE_ID = '123'
    process.env.FB_PAGE_ACCESS_TOKEN = 'page-token'
    process.env.SOCIAL_FACEBOOK_WEBHOOK = 'https://hook.us1.make.com/abc'
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }))

    const results = await broadcastWeeklyDigest()
    expect(results.facebook.status).toBe('posted')
    const fbCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('graph.facebook.com'))
    expect(fbCall).toBeDefined()
    // direct Graph wins over the webhook when both are configured
    expect(fetchSpy.mock.calls.find(([input]) => String(input).includes('hook.us1.make.com'))).toBeUndefined()
    const [url, init] = fbCall!
    expect(String(url)).toContain('graph.facebook.com/v21.0/123/feed')
    expect(String(url)).not.toContain('page-token')
    expect(String(init?.body)).toContain('page-token')
    expect(String(init?.body)).toContain('link=')
  })
})
