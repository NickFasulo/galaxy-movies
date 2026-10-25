import { vi } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'

let ipSeq = 0
export const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

export interface MakeReqOptions {
  method?: string
  query?: Record<string, string | string[]>
  body?: unknown
  headers?: Record<string, string>
  ip?: string
  ua?: string
}

export function makeReq({ method = 'GET', query = {}, body, headers = {}, ip, ua }: MakeReqOptions = {}): NextApiRequest {
  const remoteIp = ip ?? nextIp()
  const uaValue = ua === undefined ? UA : ua
  return {
    method,
    headers: {
      ...(uaValue ? { 'user-agent': uaValue } : {}),
      'x-forwarded-for': remoteIp,
      ...headers
    },
    query,
    body,
    socket: { remoteAddress: remoteIp }
  } as unknown as NextApiRequest
}

export interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
  textBody?: string
  headers: Record<string, string | string[]>
  redirectTo?: { code: number; url: string }
  ended: boolean
}

export function makeRes(): MockRes {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    textBody: undefined as string | undefined,
    headers: {} as Record<string, string | string[]>,
    redirectTo: undefined as { code: number; url: string } | undefined,
    ended: false,
    setHeader(name: string, value: string | string[]) {
      res.headers[name] = value
    },
    getHeader(name: string) {
      return res.headers[name]
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.jsonBody = payload
      return res
    },
    send(payload: unknown) {
      res.textBody = typeof payload === 'string' ? payload : JSON.stringify(payload)
      res.ended = true
      return res
    },
    end() {
      res.ended = true
      return res
    },
    redirect(codeOrUrl: number | string, url?: string) {
      res.redirectTo = typeof codeOrUrl === 'number'
        ? { code: codeOrUrl, url: url as string }
        : { code: 302, url: codeOrUrl }
      return res
    }
  }
  return res as unknown as MockRes
}

// Map-backed Redis stand-in. kv.eval reproduces INCR_WITH_WINDOW_LUA's
// INCRBY-then-return semantics, so rate limits and global budgets actually
// tick in tests instead of being stubbed to "always allowed".
export function createFakeRedis() {
  const map = new Map<string, unknown>()
  const kv = {
    get: vi.fn(async (key: string) => map.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      map.set(key, value)
      return 'OK'
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0
      for (const k of keys) if (map.delete(k)) n++
      return n
    }),
    incr: vi.fn(async (key: string) => {
      const n = Number(map.get(key) || 0) + 1
      map.set(key, n)
      return n
    }),
    incrby: vi.fn(async (key: string, by: number) => {
      const n = Number(map.get(key) || 0) + by
      map.set(key, n)
      return n
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => -1),
    hget: vi.fn(async (key: string, field: string) =>
      (map.get(key) as Record<string, unknown> | undefined)?.[field] ?? null),
    hset: vi.fn(async (key: string, fields: Record<string, unknown>) => {
      const cur = (map.get(key) as Record<string, unknown>) || {}
      Object.assign(cur, fields)
      map.set(key, cur)
      return Object.keys(fields).length
    }),
    hdel: vi.fn(async (key: string, ...fields: string[]) => {
      const cur = map.get(key) as Record<string, unknown> | undefined
      let n = 0
      if (cur) {
        for (const f of fields) if (delete cur[f]) n++
        // Redis removes a hash outright once its last field is gone.
        if (Object.keys(cur).length === 0) map.delete(key)
      }
      return n
    }),
    hgetall: vi.fn(async (key: string) => (map.get(key) as Record<string, unknown>) ?? null),
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => map.get(k) ?? null)),
    eval: vi.fn(async (...[, keys, args]: [string, string[], (string | number)[]]) => {
      const count = Number(map.get(keys[0]) || 0) + Number(args[0])
      map.set(keys[0], count)
      return count
    })
  }
  return { map, kv }
}

// One shared instance per test file — vitest isolates modules per file, so
// each file gets its own store. Clear it in beforeEach.
export const fakeRedis = createFakeRedis()

export function resetFakeRedis() {
  fakeRedis.map.clear()
  vi.clearAllMocks()
}
