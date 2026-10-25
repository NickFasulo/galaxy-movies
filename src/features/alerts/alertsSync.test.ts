import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './alertsSync'
import type { UserData } from '../../lib/userData'

const data = (overrides: Partial<UserData> = {}): UserData => ({
  watchlist: [],
  ratings: {},
  services: { region: 'US', providers: [] },
  ...overrides
})

describe('buildSnapshot', () => {
  it('serializes ratings from tv-namespaced and bare keys', () => {
    const snapshot = buildSnapshot(data({
      ratings: {
        5: { rating: 8, title: 'Film', mediaType: 'movie' },
        'tv:7': { rating: 3, title: 'Show', mediaType: 'tv' }
      }
    }))
    expect(snapshot.ratings).toEqual([
      { id: 5, mediaType: 'movie', title: 'Film', rating: 8, poster_path: null, year: null },
      { id: 7, mediaType: 'tv', title: 'Show', rating: 3, poster_path: null, year: null }
    ])
  })

  it('carries poster and year so a restored list renders properly', () => {
    const snapshot = buildSnapshot(data({
      watchlist: [{ id: 1, mediaType: 'movie', title: 'T', poster_path: '/x.jpg', year: '2021', added_at: 'a' }],
      ratings: { 1: { rating: 9, title: 'T', mediaType: 'movie', id: 1, poster_path: '/x.jpg', year: '2021' } }
    }))
    expect(snapshot.watchlist?.[0]).toMatchObject({ poster_path: '/x.jpg', year: '2021' })
    expect(snapshot.ratings?.[0]).toMatchObject({ poster_path: '/x.jpg', year: '2021' })
  })

  it('skips ratings entries whose id cannot be recovered', () => {
    const snapshot = buildSnapshot(data({
      ratings: { bogus: { rating: 5, title: 'Broken', mediaType: 'movie' } } as unknown as UserData['ratings']
    }))
    expect(snapshot.ratings).toEqual([])
  })
})

import { vi, beforeEach, afterEach } from 'vitest'
import {
  getAlertsCredentials,
  setAlertsCredentials,
  fetchSyncedPrefs,
  syncAlertsNow,
  scheduleAlertsSync
} from './alertsSync'

const makeStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    store
  }
}

const stubWindow = (store = makeStorage()) => {
  vi.stubGlobal('window', { localStorage: store })
  return store
}

const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(
  async () => ({ ok: true, json: async () => ({}) }))

describe('alerts credentials', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips credentials through localStorage', () => {
    stubWindow()
    setAlertsCredentials('a@b.c', 'k1')
    expect(getAlertsCredentials()).toEqual({ email: 'a@b.c', key: 'k1' })
  })

  it('returns null on malformed stored JSON and when window is absent', () => {
    const storage = stubWindow()
    storage.store.set('gm.alerts.v1', '{broken')
    expect(getAlertsCredentials()).toBeNull()
    vi.unstubAllGlobals()
    expect(getAlertsCredentials()).toBeNull()
    // setAlertsCredentials must not throw server-side either.
    setAlertsCredentials('a@b.c', 'k1')
  })
})

describe('fetchSyncedPrefs', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy) })
  afterEach(() => vi.unstubAllGlobals())

  it('returns the stored prefs object on a 200', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ prefs: { region: 'IN' } }) })
    const prefs = await fetchSyncedPrefs({ email: 'e@x.y', key: 'k' })
    expect(prefs).toEqual({ region: 'IN' })
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('email=e%40x.y')
    expect(url).toContain('key=k')
  })

  it('returns null on a non-ok response, a prefs-less body, and a fetch failure', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    expect(await fetchSyncedPrefs({ email: 'e', key: 'k' })).toBeNull()
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    expect(await fetchSyncedPrefs({ email: 'e', key: 'k' })).toBeNull()
    fetchSpy.mockRejectedValueOnce(new Error('net down'))
    expect(await fetchSyncedPrefs({ email: 'e', key: 'k' })).toBeNull()
  })
})

describe('syncAlertsNow', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy) })
  afterEach(() => vi.unstubAllGlobals())

  it('posts the snapshot once, then skips an identical re-sync', async () => {
    const storage = stubWindow()
    const creds = { email: 'e@x.y', key: 'k' }
    const userData = data({ watchlist: [{ id: 1, mediaType: 'movie', title: 'T', poster_path: null, year: null, added_at: 'a' }] })

    await syncAlertsNow(userData, creds)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/alerts-prefs')
    expect(JSON.parse(init.body as string)).toMatchObject({ email: 'e@x.y', key: 'k', region: 'US' })
    expect(storage.store.get('gm.alerts.lastSynced')).toBeTruthy()

    await syncAlertsNow(userData, creds)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('posts again when the data actually changed', async () => {
    stubWindow()
    const creds = { email: 'e@x.y', key: 'k' }
    await syncAlertsNow(data(), creds)
    await syncAlertsNow(data({ services: { region: 'IN', providers: ['netflix'] } }), creds)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('retries next time when the post fails and never throws', async () => {
    stubWindow()
    fetchSpy.mockRejectedValueOnce(new Error('down'))
    await expect(syncAlertsNow(data(), { email: 'e', key: 'k' })).resolves.toBeUndefined()
    await syncAlertsNow(data(), { email: 'e', key: 'k' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not stamp lastSynced when the server rejects the payload', async () => {
    const storage = stubWindow()
    fetchSpy.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    await syncAlertsNow(data(), { email: 'e', key: 'k' })
    expect(storage.store.get('gm.alerts.lastSynced')).toBeUndefined()
    await syncAlertsNow(data(), { email: 'e', key: 'k' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('no-ops without credentials and without window', async () => {
    await syncAlertsNow(data(), null)
    expect(fetchSpy).not.toHaveBeenCalled()
    stubWindow()
    await syncAlertsNow(data()) // no stored creds
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('scheduleAlertsSync', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('debounces repeated edits into one post', async () => {
    stubWindow()
    setAlertsCredentials('e@x.y', 'k')
    const ud = data()
    scheduleAlertsSync(ud)
    scheduleAlertsSync(ud)
    scheduleAlertsSync(ud)
    expect(fetchSpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does nothing without stored credentials or window', async () => {
    stubWindow()
    scheduleAlertsSync(data())
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    scheduleAlertsSync(data())
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
