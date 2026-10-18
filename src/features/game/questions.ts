import { getRedis } from '../../lib/redis'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../catalog/tmdb'
import { getProviderCatalog, getProviderChanges, getTitleChangeIndex } from '../catalog/streamingChanges'
import type { CatalogTitle, ProviderChanges } from '../catalog/streamingChanges'
import { SITE_URL } from '../../lib/site'

// Question content for the "Still Streaming?" Devvit app — everything is
// generated from the daily catalog snapshots + diffs the streaming-changes
// cron already maintains, so no new upstream calls are needed.

export interface TriviaQuestion {
  id: string
  prompt: string
  options: string[]
  answerIndex: number
  link: string
}

export interface SlateEntry {
  tmdbId: number
  tmdbType: string
  title: string
}

export const GAME_PROVIDERS = Object.keys(PROVIDER_NAME_MATCH)

export const providerLabel = (key: string) =>
  streamingProviders[key]?.title?.replace(/ Movies$/, '') || key

// Deterministic PRNG — the same date seed must produce the same question set
// for every installed subreddit.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const seedFrom = (s: string) => [...s].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7)

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const norm = (t: string) => t.toLowerCase().trim()

interface BuildContext {
  changes: Record<string, ProviderChanges>
  catalogs: Record<string, CatalogTitle[]>
  used: Set<string>
  rng: () => number
  questions: TriviaQuestion[]
}

type DiffKind = 'left' | 'added' | 'coming'

const DIFF_PROMPTS: Record<DiffKind, (label: string) => string> = {
  left: (label) => `Which of these left ${label} this week?`,
  added: (label) => `Which of these just arrived on ${label}?`,
  coming: (label) => `Which of these is coming soon to ${label}?`
}

function diffQuestion(ctx: BuildContext, kind: DiffKind, providerOrder: string[]): TriviaQuestion | null {
  for (const key of providerOrder) {
    const change = ctx.changes[key]
    if (!change) continue
    const pool = (kind === 'coming' ? change.coming : change[kind]) as CatalogTitle[]
    const answer = pool.find((t) => !ctx.used.has(norm(t.title)))
    if (!answer) continue

    const inDiff = new Set(
      [...change.added, ...change.left, ...change.coming].map((t) => norm(t.title))
    )
    const distractors = shuffle(
      ctx.rng,
      (ctx.catalogs[key] || []).filter(
        (t) => !inDiff.has(norm(t.title)) && !ctx.used.has(norm(t.title))
      )
    ).slice(0, 3)
    if (distractors.length < 3) continue

    const options = shuffle(ctx.rng, [answer.title, ...distractors.map((d) => d.title)])
    ctx.used.add(norm(answer.title))
    for (const d of distractors) ctx.used.add(norm(d.title))
    return {
      id: `q${ctx.questions.length + 1}`,
      prompt: DIFF_PROMPTS[kind](providerLabel(key)),
      options,
      answerIndex: options.indexOf(answer.title),
      link: `${SITE_URL}/leaving/${key}`
    }
  }
  return null
}

function whereQuestion(ctx: BuildContext, providerOrder: string[]): TriviaQuestion | null {
  for (const key of providerOrder) {
    const others = providerOrder.filter((k) => k !== key && (ctx.catalogs[k] || []).length)
    for (const title of shuffle(ctx.rng, (ctx.catalogs[key] || []).slice(0, 120))) {
      if (ctx.used.has(norm(title.title))) continue
      const absentIn = others.filter(
        (k) => !(ctx.catalogs[k] || []).some((o) => norm(o.title) === norm(title.title))
      )
      if (absentIn.length < 3) continue
      const wrong = shuffle(ctx.rng, absentIn).slice(0, 3)
      const options = shuffle(ctx.rng, [providerLabel(key), ...wrong.map(providerLabel)])
      ctx.used.add(norm(title.title))
      return {
        id: `q${ctx.questions.length + 1}`,
        prompt: `Where is ${title.title} streaming right now?`,
        options,
        answerIndex: options.indexOf(providerLabel(key)),
        link: `${SITE_URL}/${title.tmdbType === 'tv' ? 'tv' : 'movies'}/${title.tmdbId}`
      }
    }
  }
  return null
}

export function buildDailyQuestions(
  changes: Record<string, ProviderChanges>,
  catalogs: Record<string, CatalogTitle[]>,
  date: string,
  count = 4
): TriviaQuestion[] {
  const rng = mulberry32(seedFrom(date))
  const ctx: BuildContext = { changes, catalogs, used: new Set(), rng, questions: [] }
  const order = shuffle(rng, Object.keys(catalogs).filter((k) => catalogs[k]?.length))

  // One of each kind first, then pad with whatever diff data exists.
  const kinds: DiffKind[] = shuffle(rng, ['left', 'added', 'coming'] as DiffKind[])
  for (const kind of kinds) {
    if (ctx.questions.length >= count - 1) break
    const q = diffQuestion(ctx, kind, order)
    if (q) ctx.questions.push(q)
  }
  const where = whereQuestion(ctx, order)
  if (where) ctx.questions.push(where)

  while (ctx.questions.length < count) {
    const kind: DiffKind = (['left', 'added', 'coming'] as const)[ctx.questions.length % 3]
    const q = diffQuestion(ctx, kind, order)
    if (!q) break
    ctx.questions.push(q)
  }
  return ctx.questions
}

export async function getDailyTrivia(date = new Date().toISOString().split('T')[0]) {
  const [changes, catalogEntries] = await Promise.all([
    getProviderChanges(GAME_PROVIDERS),
    Promise.all(GAME_PROVIDERS.map(async (k) => [k, await getProviderCatalog(k)] as const))
  ])
  const catalogs = Object.fromEntries(catalogEntries)
  const questions = buildDailyQuestions(changes, catalogs, date)
  if (questions.length < 2) return null
  return { date, questions }
}

// ---------- Weekly prediction slate ----------

const weekKey = (d = new Date()) => {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
  return `${d.getUTCFullYear()}-W${week}`
}

const slateKey = (week: string) => `trivia:slate:${week}`

interface SlateRecord {
  week: string
  provider: string
  slate: SlateEntry[]
}

export async function getWeeklySlate(week = weekKey()): Promise<SlateRecord | null> {
  const kv = getRedis()
  if (kv) {
    const cached = await kv.get<SlateRecord>(slateKey(week)).catch(() => null)
    if (cached) return cached
  }

  // Rotate the headline service by week seed, falling forward to the next
  // provider if the seeded one's catalog is too thin.
  const providers = GAME_PROVIDERS.filter((k) => k !== 'crunchyroll')
  const start = (seedFrom(week) >>> 0) % providers.length
  let provider = ''
  let catalog: CatalogTitle[] = []
  for (let i = 0; i < providers.length; i++) {
    const key = providers[(start + i) % providers.length]
    const titles = await getProviderCatalog(key)
    if (titles.length >= 12) {
      provider = key
      catalog = titles
      break
    }
  }
  if (!provider) return null

  const rng = mulberry32(seedFrom(`${week}:slate`))
  const slate = shuffle(rng, catalog.slice(10, 80))
    .filter((t): t is CatalogTitle & { tmdbId: number } => Boolean(t.tmdbId))
    .slice(0, 8)
    .map(({ tmdbId, tmdbType, title }) => ({ tmdbId, tmdbType, title }))
  if (slate.length < 6) return null

  const record: SlateRecord = { week, provider, slate }
  await kv?.set(slateKey(week), record, { ex: 60 * 60 * 24 * 14 }).catch(() => {})
  return record
}

export async function resolveWeeklySlate(week: string) {
  const kv = getRedis()
  const record = kv ? await kv.get<SlateRecord>(slateKey(week)).catch(() => null) : null
  if (!record) return null

  // Only count departures dated within the slate's week — the title index
  // carries events for the whole month, so an earlier-in-month "left" would
  // be a false positive here.
  const [year, w] = week.split('-W').map(Number)
  const weekStart = new Date(Date.UTC(year, 0, 1 + (w - 1) * 7))
  const inWeek = (date?: string) => !date || date >= weekStart.toISOString().split('T')[0]

  const index = (await getTitleChangeIndex('US')) || {}
  const actualLeavers = record.slate
    .filter((s) =>
      (index[`${s.tmdbType}:${s.tmdbId}`]?.left || []).some(
        (e) => e.p === record.provider && inWeek(e.date)
      )
    )
    .map((s) => s.title)
  return { week: record.week, provider: record.provider, actualLeavers }
}
