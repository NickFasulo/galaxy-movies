import { describe, expect, it, vi } from 'vitest'
import { summarizeChatLog, getChatDemand, CHAT_LOG_KEY, type ChatLogEntry } from './chatLog'

const entry = (over: Partial<ChatLogEntry> = {}): ChatLogEntry => ({
  ts: Date.now(),
  q: 'what should i watch tonight',
  region: 'US',
  plus: false,
  turns: 1,
  intents: ['general'],
  ...over
})

describe('summarizeChatLog', () => {
  it('counts requests, cached hits, and plus share', () => {
    const d = summarizeChatLog([entry(), entry({ cached: true }), entry({ plus: true })])
    expect(d.requests).toBe(3)
    expect(d.cached).toBe(1)
    expect(d.plus).toBe(1)
  })

  it('groups repeated questions case- and whitespace-insensitively, keeping a display form', () => {
    const d = summarizeChatLog([
      entry({ q: 'What should I watch tonight?' }),
      entry({ q: 'what  should   i watch tonight?' }),
      entry({ q: 'where can i watch Heat' })
    ])
    expect(d.topQuestions[0]).toEqual({ q: 'What should I watch tonight?', count: 2 })
    expect(d.topQuestions[1]).toEqual({ q: 'where can i watch Heat', count: 1 })
  })

  it('aggregates intents and titles across entries', () => {
    const d = summarizeChatLog([
      entry({ intents: ['availability', 'service_picks'], titles: ['Heat (1995)'] }),
      entry({ intents: ['availability'], titles: ['Heat (1995)', 'Dune (2021)'] }),
      entry({ intents: ['general'] })
    ])
    expect(d.topIntents).toEqual([
      { name: 'availability', count: 2 },
      { name: 'service_picks', count: 1 },
      { name: 'general', count: 1 }
    ])
    expect(d.topTitles[0]).toEqual({ title: 'Heat (1995)', count: 2 })
  })

  it('handles entries with missing optional fields', () => {
    const d = summarizeChatLog([entry({ intents: undefined as unknown as string[], titles: undefined })])
    expect(d.requests).toBe(1)
    expect(d.topIntents).toEqual([])
    expect(d.topTitles).toEqual([])
  })

  it('returns zeros on an empty log', () => {
    const d = summarizeChatLog([])
    expect(d).toEqual({ requests: 0, cached: 0, plus: 0, topQuestions: [], topIntents: [], topTitles: [] })
  })
})

describe('getChatDemand', () => {
  it('reads the score window and returns newest-first recents', async () => {
    const zrange = vi.fn(async () => [
      JSON.stringify(entry({ ts: 1000, q: 'first' })),
      JSON.stringify(entry({ ts: 2000, q: 'second' })),
      'not-json'
    ])
    const kv = { zrange } as unknown as Parameters<typeof getChatDemand>[0]
    const d = await getChatDemand(kv, 7)
    expect(zrange).toHaveBeenCalledWith(CHAT_LOG_KEY, expect.any(Number), '+inf', { byScore: true })
    expect(d.requests).toBe(2)
    expect(d.recent.map((e) => e.q)).toEqual(['second', 'first'])
  })
})
