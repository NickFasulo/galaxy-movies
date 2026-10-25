import { describe, expect, it } from 'vitest'
import { buildTelegramText } from './telegram'
import type { MatchedItem } from './watchlistAlerts'

const item: MatchedItem = {
  kind: 'added',
  notifiedKey: 'added:movie:1@netflix',
  tmdbId: 1,
  tmdbType: 'movie',
  title: 'Some Film',
  provider: 'Netflix'
}

describe('buildTelegramText', () => {
  it('renders markdown links and a status line', () => {
    const text = buildTelegramText([item])
    expect(text).toContain('[Some Film](https://www.galaxymovies.app/movies/1)')
    expect(text).toContain('Now on Netflix')
    expect(text).toContain('*Something on your list just moved*')
  })

  it('escapes legacy markdown characters in titles', () => {
    const text = buildTelegramText([{ ...item, title: 'A_Film *With* [Brackets]' }])
    expect(text).toContain('A\\_Film \\*With\\* \\[Brackets]')
    expect(text).not.toContain('A_Film *With*')
  })

  it('renders coming and taste status lines', () => {
    const coming: MatchedItem = { ...item, kind: 'coming', date: '20260115', season: 2 }
    const taste: MatchedItem = { ...item, kind: 'taste', via: 'Inception' }
    const text = buildTelegramText([coming, taste])
    expect(text).toContain('Coming to Netflix, Jan 15, season 2')
    expect(text).toContain('because you rated Inception highly')
  })
})

import { vi, beforeEach, afterEach } from 'vitest'
import { sendTelegramAlert, sendTelegramMessage } from './telegram'

const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(
  async () => ({ ok: true, json: async () => ({ ok: true, result: { username: 'galaxy_bot' } }) }))

describe('sendTelegramMessage', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy) })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('returns false without a bot token and never calls fetch', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    await expect(sendTelegramMessage('123', 'hi')).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts legacy-markdown text with previews disabled', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    await expect(sendTelegramMessage('123', '*hi*')).resolves.toBe(true)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bottok/sendMessage')
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: '123', text: '*hi*', parse_mode: 'Markdown', disable_web_page_preview: true
    })
  })

  it('returns false on a non-ok response and on a network error', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    fetchSpy.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    expect(await sendTelegramMessage('1', 'x')).toBe(false)
    fetchSpy.mockRejectedValueOnce(new Error('net down'))
    expect(await sendTelegramMessage('1', 'x')).toBe(false)
  })
})

describe('sendTelegramAlert', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy) })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('sends the built digest text', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    const ok = await sendTelegramAlert('42', [{
      kind: 'leaving', notifiedKey: 'leaving:movie:1@netflix',
      tmdbId: 1, tmdbType: 'movie', title: 'Gone Soon', provider: 'Netflix'
    }])
    expect(ok).toBe(true)
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.text).toContain('Leaving Netflix soon')
    expect(body.text).toContain('[Gone Soon](https://www.galaxymovies.app/movies/1)')
  })
})

describe('getBotUsername', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy); vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('fetches getMe once and caches the username', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    const mod = await import('./telegram')
    expect(await mod.getBotUsername()).toBe('galaxy_bot')
    expect(await mod.getBotUsername()).toBe('galaxy_bot')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.telegram.org/bottok/getMe')
  })

  it('returns null without a token and on a malformed response', async () => {
    const mod = await import('./telegram')
    expect(await mod.getBotUsername()).toBeNull()
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false }) })
    expect(await mod.getBotUsername()).toBeNull()
  })

  it('returns null when getMe throws', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    fetchSpy.mockRejectedValueOnce(new Error('down'))
    const mod = await import('./telegram')
    expect(await mod.getBotUsername()).toBeNull()
  })
})

describe('statusLine kinds', () => {
  it('renders leaving and episode lines', () => {
    const text = buildTelegramText([
      { kind: 'leaving', notifiedKey: 'x', tmdbId: 1, tmdbType: 'movie', title: 'Gone', provider: 'Netflix' },
      { kind: 'episode', notifiedKey: 'y', tmdbId: 2, tmdbType: 'tv', title: 'Show', provider: 'Hulu', season: 3, episode: 4, date: '20260110' }
    ])
    expect(text).toContain('Leaving Netflix soon')
    expect(text).toContain('New episode S3E4 airs Jan 10')
    expect(text).toContain('/tv/2')
  })
})
