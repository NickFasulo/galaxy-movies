import { describe, expect, it, vi, beforeEach } from 'vitest'

const store = new Map<string, string>()
vi.mock('../../lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn((k: string, v: string) => (store.set(k, v), Promise.resolve('OK'))),
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  }),
}))

import { readAdhocPost, stashAdhocPost } from './adhocPost'
import { ENGAGEMENT_PROMPTS, engagementPromptForWeek } from './engagementPrompts'
import { SOCIAL_CHANNELS } from './socialChannels'

beforeEach(() => store.clear())

describe('stashAdhocPost/readAdhocPost', () => {
  it('round-trips a post with a stable dedupe key', async () => {
    await stashAdhocPost('Line one\n\nLine two is the body.', { title: 'Custom title' })
    const a = await readAdhocPost()
    expect(a).toMatchObject({ title: 'Custom title', key: expect.stringMatching(/^adhoc:/) })
    expect(a?.text).toContain('Line two')
  })

  it('derives the title from the first line when none is given', async () => {
    await stashAdhocPost('First line becomes title\n\nRest of the post.')
    expect((await readAdhocPost())?.title).toBe('First line becomes title')
  })

  it('returns the same key for identical content (retries dedupe)', async () => {
    await stashAdhocPost('Same text', { title: 'T' })
    const k1 = (await readAdhocPost())?.key
    await stashAdhocPost('Same text', { title: 'T' })
    expect((await readAdhocPost())?.key).toBe(k1)
  })

  it('returns null on malformed stored data', async () => {
    store.set('gm:social:adhoc-post', JSON.stringify({ title: 'x' }))
    expect(await readAdhocPost()).toBeNull()
  })
})

describe('engagementPromptForWeek', () => {
  it('rotates deterministically and wraps the pool', async () => {
    const a = engagementPromptForWeek(new Date('2026-11-05T00:00:00Z'))
    const b = engagementPromptForWeek(new Date('2026-11-12T00:00:00Z'))
    expect(ENGAGEMENT_PROMPTS).toContain(a)
    expect(a).not.toBe(b)
  })

  it('every prompt fits its channel caps', () => {
    const caps = Object.fromEntries(SOCIAL_CHANNELS.map((c) => [c.name, c.maxLen]))
    for (const p of ENGAGEMENT_PROMPTS) {
      expect(p.x.length).toBeLessThanOrEqual(caps.x)
      expect(p.bsky.length).toBeLessThanOrEqual(caps.bsky)
      expect(p.long.length).toBeLessThanOrEqual(4096)
      expect(p.title.length).toBeLessThanOrEqual(300)
    }
  })
})
