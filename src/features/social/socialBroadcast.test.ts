import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

vi.mock('../../lib/redis', () => ({ getRedis: () => null }))
vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: () =>
    Promise.resolve({
      netflix: {
        added: items(['Frankenstein']),
        left: items(['Old Show']),
        coming: [],
        leavingSoon: [{ title: 'Gone Soon', date: '2026-10-31' }]
      }
    }),
  getMonthlyChanges: () => Promise.resolve({})
}))

import {
  buildBroadcastPost,
  buildDeparturesDigest,
  buildDeparturesPost,
  buildLastChanceDigest,
  buildLastChancePost,
  buildRedditDigest,
  broadcastLastChance,
  broadcastMonthlyDepartures,
  broadcastWeeklyDigest
} from './socialBroadcast'

const items = (titles: string[]) => titles.map((title) => ({ title }))

const SOCIAL_ENVS = [
  'BSKY_HANDLE', 'BSKY_APP_PASSWORD', 'SOCIAL_DISCORD_WEBHOOK', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL',
  'MASTODON_INSTANCE', 'MASTODON_TOKEN', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET',
  'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD', 'REDDIT_SUBREDDIT',
  'TUMBLR_BLOG', 'TUMBLR_ACCESS_TOKEN', 'PINTEREST_BOARD', 'PINTEREST_ACCESS_TOKEN',
  'FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN', 'SOCIAL_FACEBOOK_WEBHOOK'
]
const clearSocialEnv = () => SOCIAL_ENVS.forEach((k) => delete process.env[k])

// One shared spy for every describe — nested spyOn()s wrap each other and let
// calls fall through to the real network once the inner spy is restored.
const fetchSpy = vi.spyOn(globalThis, 'fetch')
afterAll(() => fetchSpy.mockRestore())

describe('buildBroadcastPost', () => {
  it('lists top adds and leaves per provider with the site link', () => {
    const text = buildBroadcastPost({
      netflix: { added: items(['Frankenstein', 'The Rip']), left: items(['Old Show']), coming: items([]) },
      hulu: { added: items(['Hulu Movie']), left: items([]), coming: items([]) },
      max: { added: items([]), left: items(['Max Movie']), coming: items([]) }
    })
    expect(text).toContain('Netflix: + Frankenstein + The Rip − Old Show')
    expect(text).toContain('Hulu: + Hulu Movie')
    expect(text).toContain('Max: − Max Movie')
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

describe('buildDeparturesDigest', () => {
  it('renders only dated leaving rows under provider sections', () => {
    const text = buildDeparturesDigest(
      {
        netflix: {
          added: items(['Should Not Appear']),
          leavingSoon: [
            { title: 'Gone Soon', date: '2026-10-31' },
            { title: 'Also Leaving', date: '2026-10-30' }
          ]
        },
        hulu: { leavingSoon: [{ title: 'Hulu Exit', date: '2026-10-29' }] },
        max: { leavingSoon: [] }
      },
      ['netflix', 'hulu', 'max'],
      10000
    )
    expect(text).toContain('Leaving soon on streaming:')
    expect(text).toContain('**Netflix**')
    expect(text).toContain('- Leaving soon: Gone Soon (Oct 31), Also Leaving (Oct 30)')
    expect(text).toContain('**Hulu**')
    expect(text).not.toContain('**Max**')
    expect(text).not.toContain('Should Not Appear')
    expect(text).toContain('galaxymovies.app/leaving')
  })

  it('returns empty string when nothing is leaving', () => {
    expect(buildDeparturesDigest({ netflix: { leavingSoon: [] } }, ['netflix'])).toBe('')
  })
})

describe('buildDeparturesPost', () => {
  it('lists dated departures per provider with the site link', () => {
    const text = buildDeparturesPost({
      netflix: { leavingSoon: [{ title: 'Gone Soon', date: '2026-10-31' }, { title: 'Also Gone' }] },
      hulu: { leavingSoon: [{ title: 'Hulu Exit', date: '2026-10-30' }] },
      max: {}
    })
    expect(text).toContain('− Gone Soon (Oct 31) ← Netflix')
    expect(text).toContain('− Also Gone ← Netflix')
    expect(text).toContain('− Hulu Exit (Oct 30) ← Hulu')
    expect(text).not.toContain('← Max')
    expect(text).toContain('galaxymovies.app/leaving')
    expect(text.length).toBeLessThanOrEqual(300)
  })

  it('returns empty string when nothing is leaving', () => {
    expect(buildDeparturesPost({ netflix: {} })).toBe('')
  })

  it('drops lines until the post fits the cap', () => {
    const long = Array.from({ length: 20 }, (_, i) => ({
      title: `A Very Long Title Indeed Number ${i + 1}`,
      date: '2026-10-31'
    }))
    const big = Object.fromEntries(
      ['netflix', 'hulu', 'max', 'disney-plus', 'amazon-prime-video', 'apple-tv'].map((k) => [
        k,
        { leavingSoon: long }
      ])
    )
    const text = buildDeparturesPost(big, 300)
    expect(text.length).toBeLessThanOrEqual(300)
    expect(text).toContain('galaxymovies.app/leaving')
  })
})

describe('buildLastChancePost', () => {
  // today = Oct 30, window covers Oct 30 → Nov 1
  const now = new Date('2026-10-30T12:00:00Z')

  it('lists only departures inside the window with relative day labels', () => {
    const text = buildLastChancePost(
      {
        netflix: {
          leavingSoon: [
            { title: 'Gone Tomorrow', date: '2026-10-31', popularity: 50 },
            { title: 'Gone Today', date: '2026-10-30', popularity: 10 },
            { title: 'Too Late', date: '2026-10-29' },
            { title: 'Too Far', date: '2026-11-05' },
            { title: 'Gone Sunday', date: '2026-11-01', popularity: 90 },
            { title: 'Undated' }
          ]
        }
      },
      300,
      'https://www.galaxymovies.app/leaving',
      now
    )
    expect(text).toContain('Last chance to stream')
    expect(text.indexOf('− Gone Today ← Netflix (today)')).toBeLessThan(text.indexOf('− Gone Tomorrow ← Netflix (tomorrow)'))
    expect(text).toContain('− Gone Sunday ← Netflix (Nov 1)')
    expect(text).not.toContain('Too Late')
    expect(text).not.toContain('Too Far')
    expect(text).not.toContain('Undated')
    expect(text).toContain('galaxymovies.app/leaving')
  })

  it('orders same-day rows by popularity', () => {
    const text = buildLastChancePost(
      {
        hulu: {
          leavingSoon: [
            { title: 'Obscure Exit', date: '2026-10-31', popularity: 3 },
            { title: 'Famous Exit', date: '2026-10-31', popularity: 99 }
          ]
        }
      },
      300,
      'https://www.galaxymovies.app/leaving',
      now
    )
    expect(text.indexOf('Famous Exit')).toBeLessThan(text.indexOf('Obscure Exit'))
  })

  it('returns empty string when nothing is inside the window', () => {
    expect(
      buildLastChancePost(
        { netflix: { leavingSoon: [{ title: 'Too Far', date: '2026-11-20' }] } },
        300,
        'https://www.galaxymovies.app/leaving',
        now
      )
    ).toBe('')
  })

  it('drops lines until the post fits the cap', () => {
    const long = Array.from({ length: 20 }, (_, i) => ({
      title: `A Very Long Title Indeed Number ${i + 1}`,
      date: '2026-10-31'
    }))
    const big = Object.fromEntries(
      ['netflix', 'hulu', 'max', 'disney-plus', 'amazon-prime-video', 'apple-tv'].map((k) => [
        k,
        { leavingSoon: long }
      ])
    )
    const text = buildLastChancePost(big, 300, 'https://www.galaxymovies.app/leaving', now)
    expect(text.length).toBeLessThanOrEqual(300)
    expect(text).toContain('galaxymovies.app/leaving')
  })
})

describe('buildLastChanceDigest', () => {
  const now = new Date('2026-10-30T12:00:00Z')

  it('renders windowed departures under provider sections', () => {
    const text = buildLastChanceDigest(
      {
        netflix: {
          leavingSoon: [
            { title: 'Gone Tomorrow', date: '2026-10-31' },
            { title: 'Too Far', date: '2026-11-20' }
          ]
        },
        hulu: { leavingSoon: [{ title: 'Hulu Exit', date: '2026-10-30' }] }
      },
      ['netflix', 'hulu'],
      10000,
      'https://www.galaxymovies.app/leaving',
      now
    )
    expect(text).toContain('Last chance to stream')
    expect(text).toContain('- Leaving soon: Gone Tomorrow (Oct 31)')
    expect(text).toContain('- Leaving soon: Hulu Exit (Oct 30)')
    expect(text).not.toContain('Too Far')
    expect(text).toContain('galaxymovies.app/leaving')
  })

  it('returns empty string when nothing is inside the window', () => {
    expect(buildLastChanceDigest({ netflix: { leavingSoon: [] } }, ['netflix'], 10000, 'https://x', now)).toBe('')
  })
})

describe('broadcastWeeklyDigest', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    clearSocialEnv()
  })

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
    // per-channel UTM tags let Umami attribute social traffic
    expect(body.message).toContain('utm_source=facebook')
    expect(body.link).toContain('utm_campaign=weekly')
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

describe('broadcastMonthlyDepartures', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    clearSocialEnv()
  })

  it('posts the leaving-soon post to configured channels', async () => {
    process.env.SOCIAL_FACEBOOK_WEBHOOK = 'https://hook.us1.make.com/abc'
    fetchSpy.mockResolvedValue(new Response('Accepted', { status: 200 }))

    const results = await broadcastMonthlyDepartures()
    expect(results.facebook.status).toBe('posted')
    expect(results.bsky.status).toBe('skipped')
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.message).toContain('Leaving soon')
    expect(body.message).toContain('Gone Soon (Oct 31)')
    expect(body.link).toContain('galaxymovies.app/leaving')
    expect(body.link).toContain('utm_campaign=monthly')
  })

  it('skips every channel when no credentials are set', async () => {
    const results = await broadcastMonthlyDepartures()
    for (const r of Object.values(results)) expect(r.status).toBe('skipped')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('broadcastLastChance', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    clearSocialEnv()
  })

  it('posts the urgency post with a deep provider link and utm tags', async () => {
    process.env.SOCIAL_FACEBOOK_WEBHOOK = 'https://hook.us1.make.com/abc'
    fetchSpy.mockResolvedValue(new Response('Accepted', { status: 200 }))

    // Mock diff has Gone Soon leaving Netflix on Oct 31 — inside the window
    // on Oct 30, and it's the only provider, so the link goes deep.
    const results = await broadcastLastChance(new Date('2026-10-30T12:00:00Z'))
    expect(results.facebook.status).toBe('posted')
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.message).toContain('Last chance to stream')
    expect(body.message).toContain('Gone Soon')
    expect(body.message).toContain('(tomorrow)')
    expect(body.link).toContain('galaxymovies.app/leaving/netflix')
    expect(body.link).toContain('utm_source=facebook')
    expect(body.link).toContain('utm_campaign=lastchance')
  })

  it('skips with nothing to post when the window is empty', async () => {
    process.env.SOCIAL_FACEBOOK_WEBHOOK = 'https://hook.us1.make.com/abc'
    const results = await broadcastLastChance(new Date('2026-12-01T12:00:00Z'))
    expect(results.facebook.status).toBe('skipped')
    expect(results.facebook.reason).toBe('nothing to post')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('reddit channel', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    clearSocialEnv()
    process.env.REDDIT_CLIENT_ID = 'id'
    process.env.REDDIT_CLIENT_SECRET = 'secret'
    process.env.REDDIT_USERNAME = 'bot'
    process.env.REDDIT_PASSWORD = 'pass'
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes('access_token')
        ? new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
        : new Response('{}', { status: 200 })
    )
  })

  const submitBody = () =>
    new URLSearchParams(
      String(fetchSpy.mock.calls.find(([input]) => String(input).includes('oauth.reddit.com/api/submit'))![1]?.body)
    )

  it('posts the weekly digest as a markdown self post to the subreddit', async () => {
    const results = await broadcastWeeklyDigest()
    expect(results.reddit.status).toBe('posted')

    const body = submitBody()
    expect(body.get('sr')).toBe('galaxymovies')
    expect(body.get('kind')).toBe('self')
    expect(body.get('title')).toBe("This week's streaming moves: new arrivals & departures")
    expect(body.get('text')).toContain('**Netflix**')
    expect(body.get('text')).toContain('- Added: Frankenstein')
    expect(body.get('text')).toContain('- Leaving soon: Gone Soon (Oct 31)')
    expect(body.get('text')).toContain('galaxymovies.app/leaving')
    expect(body.get('url')).toBeNull()
  })

  it('honors REDDIT_SUBREDDIT override', async () => {
    process.env.REDDIT_SUBREDDIT = 'testsub'
    await broadcastWeeklyDigest()
    expect(submitBody().get('sr')).toBe('testsub')
  })

  it('posts the monthly departures digest with a dated title', async () => {
    const results = await broadcastMonthlyDepartures()
    expect(results.reddit.status).toBe('posted')

    const body = submitBody()
    expect(body.get('kind')).toBe('self')
    expect(body.get('title')).toBe("Leaving soon on streaming: this month's departures")
    expect(body.get('text')).toContain('- Leaving soon: Gone Soon (Oct 31)')
  })
})
