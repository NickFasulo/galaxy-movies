import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  buildCommandResponse,
  isDeferred,
  parseSlackPayload,
  verifySlackSignature,
  type SlackCommand
} from './slackCommands'
import type { WhereResult } from '../catalog/whereLookup'

const mocks = vi.hoisted(() => ({
  getProviderChanges: vi.fn<(keys?: string[]) => Promise<Record<string, unknown>>>(async () => ({})),
  lookupWhere: vi.fn<(q?: unknown) => Promise<WhereResult | null>>(async () => null)
}))

vi.mock('../catalog/streamingChanges', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, getProviderChanges: mocks.getProviderChanges }
})
vi.mock('../catalog/whereLookup', () => ({
  lookupWhere: mocks.lookupWhere
}))
vi.mock('../catalog/embed', () => ({
  embeddableProviders: () => [
    { key: 'netflix', label: 'Netflix' },
    { key: 'hulu', label: 'Hulu' }
  ],
  isEmbeddableProvider: (key: string) => key === 'netflix' || key === 'hulu',
  providerLabel: (key: string) => (key === 'netflix' ? 'Netflix' : key === 'hulu' ? 'Hulu' : key)
}))

const cmd = (command: string, text = ''): SlackCommand => ({
  command,
  text,
  team_id: 'T1',
  channel_id: 'C1',
  response_url: 'https://hooks.slack.com/commands/x'
})

const added = [
  { tmdbId: 1, tmdbType: 'movie' as const, title: 'Alpha Film', year: 2025, popularity: 5 },
  { tmdbId: 2, tmdbType: 'tv' as const, title: 'Beta Show', year: 2024, popularity: 50 }
]

const sectionText = (res: { blocks?: { text?: { type: string; text: string } }[] }) =>
  res.blocks?.[0]?.text?.text || ''

describe('command responses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProviderChanges.mockImplementation(async (keys: string[] = []) =>
      Object.fromEntries(
        keys.map((k) => [
          k,
          {
            source: k === 'netflix' ? 'Netflix' : 'Hulu',
            updatedAt: 1,
            added,
            left: [{ tmdbId: 9, tmdbType: 'movie', title: 'Old Film', year: 2010 }],
            coming: [],
            leavingSoon: [{ tmdbId: 8, tmdbType: 'movie', title: 'Soon Out', date: '2026-12-01', season: null }]
          }
        ])
      )
    )
  })

  it('/new without provider merges across services, popularity-sorted', async () => {
    const res = await buildCommandResponse(cmd('/new'))
    const text = sectionText(res)
    expect(text).toContain('*New on streaming this week*')
    expect(text.indexOf('Beta Show')).toBeLessThan(text.indexOf('Alpha Film'))
    expect(text).toContain('Netflix')
    expect(res.response_type).toBe('ephemeral')
  })

  it('/new with provider scopes to that service', async () => {
    const res = await buildCommandResponse(cmd('/new', 'netflix'))
    expect(sectionText(res)).toContain('*New on Netflix this week*')
    expect(sectionText(res)).toContain('/leaving/netflix')
  })

  it('/leaving includes dated departures', async () => {
    const res = await buildCommandResponse(cmd('/leaving', 'netflix'))
    const text = sectionText(res)
    expect(text).toContain('*Leaving Netflix*')
    expect(text).toContain('Soon Out')
    expect(text).toContain('Old Film')
  })

  it('missing or unknown provider returns usage', async () => {
    for (const text of ['', 'quibi']) {
      const res = await buildCommandResponse(cmd('/leaving', text))
      expect(sectionText(res)).toContain('`netflix`')
    }
  })

  it('/where renders providers grouped by monetization, in channel', async () => {
    mocks.lookupWhere.mockResolvedValue({
      tmdbId: 550,
      tmdbType: 'movie',
      title: 'Fight Club',
      year: 1999,
      region: 'US',
      providers: {
        flatrate: [{ id: 8, name: 'Netflix' }],
        free: [],
        ads: [],
        rent: [{ id: 2, name: 'Apple TV' }],
        buy: []
      },
      url: 'https://www.galaxymovies.app/movies/550'
    })
    const res = await buildCommandResponse(cmd('/where', 'fight club'))
    const text = sectionText(res)
    expect(text).toContain('Fight Club (1999)')
    expect(text).toContain('*Stream:* Netflix')
    expect(text).toContain('*Rent/buy:* Apple TV')
    expect(res.response_type).toBe('in_channel')
  })

  it('/where miss returns a search link', async () => {
    mocks.lookupWhere.mockResolvedValue(null)
    const res = await buildCommandResponse(cmd('/where', 'nope'))
    expect(sectionText(res)).toContain('/search?q=nope')
  })

  it('/where without a query returns usage', async () => {
    const res = await buildCommandResponse(cmd('/where'))
    expect(sectionText(res)).toContain('/where fight club')
    expect(mocks.lookupWhere).not.toHaveBeenCalled()
  })

  it('/calendar links the ICS feed', async () => {
    const res = await buildCommandResponse(cmd('/calendar', 'hulu'))
    expect(sectionText(res)).toContain('/api/cal/hulu')
  })

  it('unknown commands get a fallback', async () => {
    const res = await buildCommandResponse(cmd('/bogus'))
    expect(res.text).toBe('Unknown command.')
  })

  it('only /where is deferred', () => {
    expect(isDeferred('/where')).toBe(true)
    expect(isDeferred('/new')).toBe(false)
  })
})

describe('parseSlackPayload', () => {
  it('extracts form fields', () => {
    const raw = 'command=%2Fwhere&text=fight+club&team_id=T123&channel_id=C456&response_url=https%3A%2F%2Fhooks.slack.com%2Fx'
    const p = parseSlackPayload(raw)
    expect(p.command).toBe('/where')
    expect(p.text).toBe('fight club')
    expect(p.team_id).toBe('T123')
    expect(p.response_url).toBe('https://hooks.slack.com/x')
  })
})

describe('verifySlackSignature', () => {
  const secret = 'signing-secret'
  const body = 'command=%2Fnew&text=netflix'
  const ts = '1730000000'
  const sign = (s: string, t: string, b: string) =>
    `v0=${createHmac('sha256', s).update(`v0:${t}:${b}`).digest('hex')}`

  it('verifies a correct signature and rejects tampering', async () => {
    const now = Number(ts) + 10
    expect(await verifySlackSignature(body, sign(secret, ts, body), ts, secret, now)).toBe(true)
    expect(await verifySlackSignature(body + 'x', sign(secret, ts, body), ts, secret, now)).toBe(false)
    expect(await verifySlackSignature(body, sign('other', ts, body), ts, secret, now)).toBe(false)
  })

  it('rejects stale timestamps and malformed headers', async () => {
    const sig = sign(secret, ts, body)
    expect(await verifySlackSignature(body, sig, ts, secret, Number(ts) + 301)).toBe(false)
    expect(await verifySlackSignature(body, sig, ts, secret, Number(ts) - 301)).toBe(false)
    expect(await verifySlackSignature(body, sig.replace('v0=', ''), ts, secret, Number(ts))).toBe(false)
    expect(await verifySlackSignature(body, sig, '', secret, Number(ts))).toBe(false)
  })
})
