import OpenAI from 'openai'
import { getRedis } from './redis'

export type AiTask = 'chat' | 'review' | 'intro' | 'similar' | 'tagline' | 'discover'

type ReasoningEffort = OpenAI.Chat.ChatCompletionReasoningEffort | 'none'

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna'

// 'none' keeps latency-sensitive tasks fast; discover drafts long-lived TMDB
// filters, so it gets some reasoning. The API accepts 'none'; openai@4.77's
// ChatCompletionReasoningEffort predates it.
const TASK_EFFORT: Record<AiTask, ReasoningEffort> = {
  chat: 'none',
  review: 'none',
  intro: 'none',
  similar: 'none',
  tagline: 'none',
  discover: 'low'
}

const VALID_EFFORTS = new Set(['none', 'low', 'medium', 'high'])

function taskModel(task: AiTask): string {
  return process.env[`OPENAI_MODEL_${task.toUpperCase()}`] || DEFAULT_MODEL
}

function taskEffort(task: AiTask): ReasoningEffort {
  const override = process.env[`OPENAI_EFFORT_${task.toUpperCase()}`]
  return VALID_EFFORTS.has(override || '') ? (override as ReasoningEffort) : TASK_EFFORT[task]
}

export function aiModel(task: AiTask): string {
  return taskModel(task)
}

// GPT-6 rejects temperature when reasoning effort is enabled, so it is only
// sent for 'none' tasks.
export function aiParams(task: AiTask, maxCompletionTokens: number, temperature: number) {
  const effort = taskEffort(task)
  return {
    model: taskModel(task),
    max_completion_tokens: maxCompletionTokens,
    reasoning_effort: effort as OpenAI.Chat.ChatCompletionReasoningEffort,
    ...(effort === 'none' ? { temperature } : {})
  }
}

interface AiUsage {
  prompt_tokens?: number
  completion_tokens?: number
  // SDK 4.77 types lack cache_write_tokens, but the API returns it.
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

interface AiUsageMeta {
  latencyMs?: number
  ttftMs?: number
}

// Feeds the chatAnalytics cost estimate with real tokens instead of the
// fixed per-message estimate. Every HINCRBY is a billed Upstash command, so
// deltas accumulate in memory and flush in one batch — stats lag by up to
// USAGE_FLUSH_MS and an instance dying loses its unflushed tail.
const pendingUsage = new Map<string, number>()
let lastUsageFlush = 0
const USAGE_FLUSH_MS = 30 * 1000
const USAGE_FLUSH_FIELDS = 50

function bumpUsage(field: string, delta: number): void {
  pendingUsage.set(field, (pendingUsage.get(field) || 0) + delta)
}

export function recordAiUsage(task: AiTask, usage: AiUsage | null | undefined, meta: AiUsageMeta = {}): void {
  const kv = getRedis()
  if (!kv) return
  const field = `${taskModel(task)}.${task}`
  const promptTokens = usage?.prompt_tokens || 0
  const cached = usage?.prompt_tokens_details?.cached_tokens || 0
  const cacheWrite = usage?.prompt_tokens_details?.cache_write_tokens || 0
  bumpUsage(`${field}.input`, promptTokens)
  bumpUsage(`${field}.output`, usage?.completion_tokens || 0)
  bumpUsage(`${field}.reasoning`, usage?.completion_tokens_details?.reasoning_tokens || 0)
  bumpUsage(`${field}.cached`, cached)
  bumpUsage(`${field}.cache_write`, cacheWrite)
  bumpUsage(`${field}.uncached`, promptTokens - cached - cacheWrite)
  bumpUsage(`${field}.requests`, 1)
  if (meta.latencyMs != null) bumpUsage(`${field}.latency_ms`, Math.round(meta.latencyMs))
  if (meta.ttftMs != null) bumpUsage(`${field}.ttft_ms`, Math.round(meta.ttftMs))

  const now = Date.now()
  if (pendingUsage.size < USAGE_FLUSH_FIELDS && now - lastUsageFlush < USAGE_FLUSH_MS) return
  lastUsageFlush = now
  const ops = [...pendingUsage.entries()].map(([f, delta]) => kv.hincrby('ai_usage', f, delta))
  pendingUsage.clear()
  Promise.all(ops).catch((err) => console.error('Redis AI usage recording error:', err))
}

let client: OpenAI | undefined

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  client = client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

const UNAVAILABLE_KEY = 'ai:unavailable'
const UNAVAILABLE_TTL_SECONDS = 60 * 60
let unavailableUntil = 0

// Only billing/auth failures trip the switch — ordinary 429 rate_limit_exceeded is transient.
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false
  if (err.status === 401 || err.status === 402) return true
  const code = err.code || (err.error as { code?: string } | undefined)?.code
  return code === 'insufficient_quota' || code === 'billing_hard_limit_reached' || code === 'billing_not_active'
}

export function markAiUnavailable(): void {
  unavailableUntil = Date.now() + UNAVAILABLE_TTL_SECONDS * 1000
  const kv = getRedis()
  if (!kv) return
  kv.set(UNAVAILABLE_KEY, 1, { ex: UNAVAILABLE_TTL_SECONDS }).catch((err) => console.error('Redis error marking AI unavailable:', err))
}

// Key present + not tripped. Redis read errors fail open (assume available).
// "Available" results are memoized for 60s per instance — this ran once per
// generation attempt and the flag exists only to cap spend, which the global
// rate budgets already bound within the same window.
let availableCheckedUntil = 0

export async function isAiAvailable(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false
  const now = Date.now()
  if (now < unavailableUntil) return false
  if (now < availableCheckedUntil) return true
  const kv = getRedis()
  if (!kv) {
    availableCheckedUntil = now + 60 * 1000
    return true
  }
  try {
    const flagged = await kv.get(UNAVAILABLE_KEY)
    if (flagged) unavailableUntil = now + 60 * 1000
    else availableCheckedUntil = now + 60 * 1000
    return !flagged
  } catch (err) {
    console.error('Redis error reading AI availability:', err)
    availableCheckedUntil = now + 60 * 1000
    return true
  }
}
