import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

vi.mock('../../lib/redis', () => ({ getRedis: () => null }))
vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: () =>
    Promise.resolve({ netflix: { added: items(['Frankenstein']), left: items(['Old Show']), coming: [] } })
}))

import { buildBroadcastPost, broadcastWeeklyDigest } from './socialBroadcast'

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

describe('broadcastWeeklyDigest', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    fetchSpy.mockReset()
    delete process.env.BSKY_HANDLE
    delete process.env.BSKY_APP_PASSWORD
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
})
