import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildCommandResponse,
  isDeferred,
  optionValue,
  verifyDiscordSignature,
  EPHEMERAL_FLAG,
  type DiscordInteraction
} from './discordCommands'
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

const interaction = (name: string, options: { name: string; value: string }[] = []): DiscordInteraction => ({
  type: 2,
  token: 'tok',
  guild_id: 'g1',
  data: { name, options }
})

const added = [
  { tmdbId: 1, tmdbType: 'movie' as const, title: 'Alpha Film', year: 2025, popularity: 5 },
  { tmdbId: 2, tmdbType: 'tv' as const, title: 'Beta Show', year: 2024, popularity: 50 }
]

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
    const res = await buildCommandResponse(interaction('new'))
    const embed = res.embeds?.[0]
    expect(embed?.title).toBe('New on streaming this week')
    const lines = embed?.description.split('\n') || []
    expect(lines[0]).toContain('Beta Show')
    expect(lines.join('\n')).toContain('Netflix')
  })

  it('/new with provider scopes to that service', async () => {
    const res = await buildCommandResponse(interaction('new', [{ name: 'provider', value: 'netflix' }]))
    expect(res.embeds?.[0]?.title).toContain('Netflix')
    expect(res.embeds?.[0]?.url).toContain('/leaving/netflix')
  })

  it('/leaving includes dated departures', async () => {
    const res = await buildCommandResponse(interaction('leaving', [{ name: 'provider', value: 'netflix' }]))
    const desc = res.embeds?.[0]?.description || ''
    expect(desc).toContain('Soon Out')
    expect(desc).toContain('Old Film')
  })

  it('unknown provider returns ephemeral usage', async () => {
    const res = await buildCommandResponse(interaction('leaving', [{ name: 'provider', value: 'quibi' }]))
    expect(res.flags).toBe(EPHEMERAL_FLAG)
    expect(res.content).toContain('`netflix`')
  })

  it('/where renders providers grouped by monetization', async () => {
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
    const res = await buildCommandResponse(interaction('where', [{ name: 'query', value: 'fight club' }]))
    const embed = res.embeds?.[0]
    expect(embed?.title).toContain('Fight Club (1999)')
    expect(embed?.description).toContain('**Stream:** Netflix')
    expect(embed?.description).toContain('**Rent/buy:** Apple TV')
    expect(mocks.lookupWhere).toHaveBeenCalledWith(expect.objectContaining({ region: 'US' }))
  })

  it('/where miss returns an ephemeral search link', async () => {
    mocks.lookupWhere.mockResolvedValue(null)
    const res = await buildCommandResponse(interaction('where', [{ name: 'query', value: 'nope' }]))
    expect(res.flags).toBe(EPHEMERAL_FLAG)
    expect(res.content).toContain('/search?q=nope')
  })

  it('/calendar links the ICS feed', async () => {
    const res = await buildCommandResponse(interaction('calendar', [{ name: 'provider', value: 'hulu' }]))
    expect(res.content).toContain('/api/cal/hulu')
  })

  it('only where is deferred', () => {
    expect(isDeferred('where')).toBe(true)
    expect(isDeferred('new')).toBe(false)
  })
})

describe('optionValue', () => {
  it('finds and trims string options', () => {
    const data = { name: 'new', options: [{ name: 'provider', value: '  hulu ' }] }
    expect(optionValue(data, 'provider')).toBe('hulu')
    expect(optionValue(data, 'missing')).toBeUndefined()
  })
})

describe('verifyDiscordSignature', () => {
  it('verifies a real Ed25519 signature and rejects tampering', async () => {
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
    const publicKeyHex = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex')
    const timestamp = '1730000000'
    const body = '{"type":1}'
    const data = new Uint8Array([...new TextEncoder().encode(timestamp), ...new TextEncoder().encode(body)])
    const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, data)
    const sigHex = Buffer.from(signature).toString('hex')

    expect(await verifyDiscordSignature(body, sigHex, timestamp, publicKeyHex)).toBe(true)
    expect(await verifyDiscordSignature(body + 'x', sigHex, timestamp, publicKeyHex)).toBe(false)
    expect(await verifyDiscordSignature(body, 'zz', timestamp, publicKeyHex)).toBe(false)
    expect(await verifyDiscordSignature(body, sigHex, '', publicKeyHex)).toBe(false)
  })
})
