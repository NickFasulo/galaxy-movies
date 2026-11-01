import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRedis } from '../../lib/redis'
import { getWatchmodeLastStatus, getWatchmodeQuota, recordWatchmodeResponse, watchmodeQuotaExceeded } from './watchmodeQuota'

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
const mockGetRedis = vi.mocked(getRedis)

afterEach(() => {
  mockGetRedis.mockReturnValue(null)
})

const respWithHeaders = (quota: string | null, used: string | null) =>
  new Response('{}', {
    headers: {
      ...(quota != null ? { 'x-account-quota': quota } : {}),
      ...(used != null ? { 'x-account-quota-used': used } : {})
    }
  })

describe('recordWatchmodeResponse', () => {
  it('persists quota headers to Redis', async () => {
    const set = vi.fn(async () => 'OK')
    mockGetRedis.mockReturnValue({ set } as unknown as ReturnType<typeof getRedis>)
    recordWatchmodeResponse(respWithHeaders('2500', '2442'))
    expect(set).toHaveBeenCalledWith(
      'wm:quota',
      expect.objectContaining({ quota: 2500, used: 2442 }),
      expect.objectContaining({ ex: expect.any(Number) })
    )
  })

  it.each([['2500', null], [null, '100'], ['abc', '100']])(
    'records status but not quota when headers are missing or malformed (quota=%s used=%s)',
    (quota, used) => {
      const set = vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'OK')
      mockGetRedis.mockReturnValue({ set } as unknown as ReturnType<typeof getRedis>)
      recordWatchmodeResponse(respWithHeaders(quota, used))
      expect(set).toHaveBeenCalledWith(
        'wm:last-status',
        expect.objectContaining({ status: 200 }),
        expect.objectContaining({ ex: expect.any(Number) })
      )
      expect(set.mock.calls.some((call) => call[0] === 'wm:quota')).toBe(false)
    }
  )

  it('records rejected responses so upstream outages are visible', async () => {
    const set = vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'OK')
    mockGetRedis.mockReturnValue({ set } as unknown as ReturnType<typeof getRedis>)
    const resp = new Response('{}', { status: 429 })
    recordWatchmodeResponse(resp)
    expect(set).toHaveBeenCalledWith('wm:last-status', expect.objectContaining({ status: 429 }), expect.anything())
    expect(set.mock.calls.some((call) => call[0] === 'wm:quota')).toBe(false)
  })
})

describe('getWatchmodeLastStatus', () => {
  it('returns the stored status', async () => {
    const s = { status: 429, path: '/title-leaving-dates/', at: 123 }
    mockGetRedis.mockReturnValue({ get: async () => s } as unknown as ReturnType<typeof getRedis>)
    await expect(getWatchmodeLastStatus()).resolves.toEqual(s)
  })

  it('returns null when nothing is recorded', async () => {
    mockGetRedis.mockReturnValue({ get: async () => null } as unknown as ReturnType<typeof getRedis>)
    await expect(getWatchmodeLastStatus()).resolves.toBeNull()
  })
})

describe('watchmodeQuotaExceeded', () => {
  it('fails open when nothing is recorded', async () => {
    mockGetRedis.mockReturnValue({ get: async () => null } as unknown as ReturnType<typeof getRedis>)
    await expect(watchmodeQuotaExceeded(0.9)).resolves.toBe(false)
  })

  it('trips at the threshold', async () => {
    mockGetRedis.mockReturnValue({
      get: async () => ({ quota: 2500, used: 2400, at: Date.now() })
    } as unknown as ReturnType<typeof getRedis>)
    await expect(watchmodeQuotaExceeded(0.9)).resolves.toBe(true)
  })

  it('stays open below the threshold', async () => {
    mockGetRedis.mockReturnValue({
      get: async () => ({ quota: 2500, used: 100, at: Date.now() })
    } as unknown as ReturnType<typeof getRedis>)
    await expect(watchmodeQuotaExceeded(0.9)).resolves.toBe(false)
  })
})

describe('getWatchmodeQuota', () => {
  it('returns the stored sample', async () => {
    const q = { quota: 2500, used: 100, at: 123 }
    mockGetRedis.mockReturnValue({ get: async () => q } as unknown as ReturnType<typeof getRedis>)
    await expect(getWatchmodeQuota()).resolves.toEqual(q)
  })
})
