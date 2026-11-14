import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

const kv = {
  hset: vi.fn<(key: string, fields: Record<string, string>) => Promise<number>>(async () => 1),
  hgetall: vi.fn<(key: string) => Promise<Record<string, string> | null>>(async () => null),
  expire: vi.fn<(key: string, secs: number) => Promise<number>>(async () => 1),
  get: vi.fn<(key: string) => Promise<string | null>>(async () => null),
  set: vi.fn<(key: string, val: string, opts?: unknown) => Promise<string>>(async () => 'OK')
}
vi.mock('../../lib/redis', () => ({ getRedis: () => kv }))
vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: () =>
    Promise.resolve({
      netflix: { added: [], left: [], coming: [], leavingSoon: [{ title: 'Gone Soon', date: '2026-10-31' }] }
    }),
  getMonthlyChanges: () => Promise.resolve({})
}))

import { collectSocialHealth, describeChannel } from './socialHealth'
import { broadcastLastChance, socialResultKey } from './socialBroadcast'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
afterAll(() => fetchSpy.mockRestore())

const NOW = new Date('2026-11-13T12:00:00Z')
const ts = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600000).toISOString()

describe('describeChannel', () => {
  it('reports no-runs as muted', () => {
    expect(describeChannel('bsky', null, NOW)).toEqual({ channel: 'bsky', tone: 'muted', text: 'no runs recorded' })
  })

  it('flags failures with the reason', () => {
    const r = describeChannel('x', { status: 'failed', scope: 'weekly', ts: ts(3), reason: '402 credits exhausted' }, NOW)
    expect(r.tone).toBe('bad')
    expect(r.text).toContain('3h ago')
    expect(r.text).toContain('402 credits exhausted')
  })

  it('reports posted and emailed as ok', () => {
    expect(describeChannel('bsky', { status: 'posted', scope: 'weekly', ts: ts(30) }, NOW).text).toContain('posted')
    expect(describeChannel('reddit-engage', { status: 'emailed', scope: 'engage', ts: ts(2) }, NOW).text).toContain('draft emailed')
  })

  it('treats not-configured as muted', () => {
    expect(describeChannel('tumblr', { status: 'skipped', scope: 'weekly', ts: ts(1), reason: 'not configured' }, NOW).tone).toBe('muted')
  })

  it('scope-gated channels show last posted instead of a warning', () => {
    const r = describeChannel('x', { status: 'skipped', scope: 'lastchance', ts: ts(1), reason: 'scope gated', lastPosted: ts(50) }, NOW)
    expect(r.tone).toBe('ok')
    expect(r.text).toContain('last posted')
  })

  it('other skip reasons warn', () => {
    const r = describeChannel('discord', { status: 'skipped', scope: 'weekly', ts: ts(5), reason: 'nothing to post' }, NOW)
    expect(r.tone).toBe('warn')
    expect(r.text).toContain('nothing to post')
  })
})

describe('collectSocialHealth + result recording', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    vi.clearAllMocks()
    for (const k of ['BSKY_HANDLE', 'BSKY_APP_PASSWORD', 'SOCIAL_DISCORD_WEBHOOK', 'SOCIAL_FACEBOOK_WEBHOOK', 'X_API_KEY']) delete process.env[k]
  })

  it('broadcasts write a last-result record per channel', async () => {
    process.env.SOCIAL_FACEBOOK_WEBHOOK = 'https://hook.us1.make.com/abc'
    fetchSpy.mockResolvedValue(new Response('Accepted', { status: 200 }))
    await broadcastLastChance(new Date('2026-10-30T12:00:00Z'))
    const fbWrite = kv.hset.mock.calls.find(([key]) => key === socialResultKey('facebook'))
    expect(fbWrite).toBeDefined()
    expect(fbWrite![1].status).toBe('posted')
    expect(fbWrite![1].scope).toBe('lastchance')
    expect(fbWrite![1].lastPosted).toBeDefined()
    expect(kv.expire).toHaveBeenCalledWith(socialResultKey('facebook'), expect.any(Number))
  })

  it('collects a row per channel plus reddit-engage', async () => {
    const rows = await collectSocialHealth(NOW)
    expect(rows.length).toBeGreaterThanOrEqual(12)
    expect(rows.find((r) => r.channel === 'reddit-engage')).toBeDefined()
    // no records yet — everything reports unprobed
    expect(rows.every((r) => r.tone === 'muted')).toBe(true)
  })
})
