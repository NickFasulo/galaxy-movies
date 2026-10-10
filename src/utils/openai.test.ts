import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import OpenAI from 'openai'

const kv = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(async () => 'OK'),
  hincrby: vi.fn<(key: string, field: string, delta: number) => Promise<number>>(),
}))
const getRedis = vi.hoisted(() => vi.fn((): unknown => null))

vi.mock('./redis', () => ({ getRedis }))

type OpenaiUtils = typeof import('./openai')
let openai: OpenaiUtils

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  getRedis.mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

const importUtils = async () => {
  openai = await import('./openai')
  return openai
}

describe('aiParams / aiModel', () => {
  it('uses gpt-6-luna with no reasoning effort for chat by default', async () => {
    const { aiParams, aiModel } = await importUtils()
    expect(aiModel('chat')).toBe('gpt-6-luna')
    expect(aiParams('chat', 300, 0.7)).toEqual({
      model: 'gpt-6-luna',
      max_completion_tokens: 300,
      reasoning_effort: 'none',
      temperature: 0.7
    })
  })

  it('omits temperature when reasoning effort is enabled', async () => {
    const { aiParams } = await importUtils()
    const params = aiParams('discover', 500, 0.4)
    expect(params.reasoning_effort).toBe('low')
    expect('temperature' in params).toBe(false)
  })

  it.each([
    ['OPENAI_MODEL', { OPENAI_MODEL: 'custom-model' }, 'custom-model'],
    ['per-task override', { OPENAI_MODEL_CHAT: 'chat-model' }, 'chat-model']
  ])('reads the model from %s', async (_label, env, expected) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    const { aiModel } = await importUtils()
    expect(aiModel('chat')).toBe(expected)
  })

  it('honors a valid OPENAI_EFFORT_CHAT override', async () => {
    vi.stubEnv('OPENAI_EFFORT_CHAT', 'high')
    const { aiParams } = await importUtils()
    const params = aiParams('chat', 300, 0.7)
    expect(params.reasoning_effort).toBe('high')
    expect('temperature' in params).toBe(false)
  })

  it('ignores an invalid effort override', async () => {
    vi.stubEnv('OPENAI_EFFORT_CHAT', 'extreme')
    const { aiParams } = await importUtils()
    expect(aiParams('chat', 300, 0.7).reasoning_effort).toBe('none')
  })
})

describe('isQuotaError', () => {
  it.each([
    ['401', new OpenAI.APIError(401, {}, undefined, new Headers())],
    ['402', new OpenAI.APIError(402, {}, undefined, new Headers())],
    ['insufficient_quota', new OpenAI.APIError(429, { code: 'insufficient_quota' }, undefined, new Headers())],
    ['billing_hard_limit_reached', new OpenAI.APIError(403, { code: 'billing_hard_limit_reached' }, undefined, new Headers())],
    ['billing_not_active', new OpenAI.APIError(403, { code: 'billing_not_active' }, undefined, new Headers())],
    ['code read off err.error', new OpenAI.APIError(503, { code: 'insufficient_quota' }, undefined, new Headers())]
  ])('trips on %s', async (_label, err) => {
    const { isQuotaError } = await importUtils()
    expect(isQuotaError(err)).toBe(true)
  })

  it.each([
    ['ordinary 429', new OpenAI.APIError(429, { code: 'rate_limit_exceeded' }, undefined, new Headers())],
    ['500 server error', new OpenAI.APIError(500, {}, undefined, new Headers())],
    ['non-APIError', new Error('network fail')],
    ['non-error value', 'oops']
  ])('does not trip on %s', async (_label, err) => {
    const { isQuotaError } = await importUtils()
    expect(isQuotaError(err)).toBe(false)
  })
})

describe('availability flag', () => {
  it('is unavailable without an API key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const { isAiAvailable } = await importUtils()
    expect(await isAiAvailable()).toBe(false)
  })

  it('is available with a key and no Redis flag', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const { isAiAvailable } = await importUtils()
    expect(await isAiAvailable()).toBe(true)
  })

  it('reads the Redis kill-switch flag and memoizes it', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    kv.get.mockResolvedValue(1)
    getRedis.mockReturnValue(kv)
    const { isAiAvailable } = await importUtils()
    expect(await isAiAvailable()).toBe(false)
    expect(await isAiAvailable()).toBe(false)
    expect(kv.get).toHaveBeenCalledTimes(1)
  })

  it('fails open when Redis errors', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    kv.get.mockRejectedValue(new Error('redis down'))
    getRedis.mockReturnValue(kv)
    const { isAiAvailable } = await importUtils()
    expect(await isAiAvailable()).toBe(true)
  })

  it('markAiUnavailable sets the flag locally and in Redis', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    getRedis.mockReturnValue(kv)
    kv.get.mockResolvedValue(null)
    const { isAiAvailable, markAiUnavailable } = await importUtils()
    markAiUnavailable()
    expect(await isAiAvailable()).toBe(false)
    expect(kv.set).toHaveBeenCalledWith('ai:unavailable', 1, { ex: 3600 })
  })
})

describe('recordAiUsage', () => {
  const usage = {
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 400, cache_write_tokens: 100 },
    completion_tokens_details: { reasoning_tokens: 50 }
  }

  it('flushes token fields to the ai_usage hash', async () => {
    getRedis.mockReturnValue(kv)
    const { recordAiUsage } = await importUtils()
    recordAiUsage('chat', usage, { latencyMs: 800, ttftMs: 300 })
    const calls = kv.hincrby.mock.calls.map((c) => [c[0], c[1], c[2]])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.input', 1000])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.output', 200])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.cached', 400])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.cache_write', 100])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.uncached', 500])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.reasoning', 50])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.requests', 1])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.latency_ms', 800])
    expect(calls).toContainEqual(['ai_usage', 'gpt-6-luna.chat.ttft_ms', 300])
  })

  it('batches deltas and flushes again after 30s', async () => {
    vi.useFakeTimers()
    getRedis.mockReturnValue(kv)
    const { recordAiUsage } = await importUtils()
    recordAiUsage('chat', usage)
    const flushed = kv.hincrby.mock.calls.length
    recordAiUsage('chat', usage)
    expect(kv.hincrby.mock.calls.length).toBe(flushed)
    vi.advanceTimersByTime(31_000)
    recordAiUsage('chat', usage)
    const second = kv.hincrby.mock.calls
    expect(second.length).toBeGreaterThan(flushed)
    const inputCall = second.find((c) => c[1] === 'gpt-6-luna.chat.input' && c[2] === 2000)
    expect(inputCall).toBeTruthy()
  })

  it('flushes immediately once 50 distinct fields are pending', async () => {
    getRedis.mockReturnValue(kv)
    const { recordAiUsage } = await importUtils()
    recordAiUsage('chat', usage) // first call always flushes (lastUsageFlush = 0)
    const flushed = kv.hincrby.mock.calls.length
    vi.stubEnv('OPENAI_MODEL_CHAT', 'other-model')
    for (const task of ['review', 'intro', 'similar', 'tagline', 'discover'] as const) {
      recordAiUsage(task, usage, { latencyMs: 1, ttftMs: 1 })
    }
    // 45 pending fields; a different chat model adds 9 more distinct ones
    recordAiUsage('chat', usage, { latencyMs: 1, ttftMs: 1 })
    expect(kv.hincrby.mock.calls.length).toBeGreaterThan(flushed)
  })

  it('does nothing without Redis', async () => {
    const { recordAiUsage } = await importUtils()
    expect(() => recordAiUsage('chat', usage)).not.toThrow()
    expect(kv.hincrby).not.toHaveBeenCalled()
  })
})
