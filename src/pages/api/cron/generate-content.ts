import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'
import { topicSeeds, type TopicSeed } from '../../../utils/topicSeeds'
import {
  fetchListMovies,
  fetchListTv,
  fetchRecommendedMovies,
  fetchRecommendedTv,
  movieGenres,
  tvGenres,
  searchKeywordId,
  searchMovieByTitle,
  searchTvByTitle
} from '../../../utils/tmdb'
import { MIN_INDEXABLE_MOVIES } from '../../../utils/contentOpportunities'
import {
  appendRunLog,
  getGeneratedLists,
  getSeedStatuses,
  paramsSignature,
  saveGeneratedList,
  setSeedStatus,
  MAX_GENERATED_LISTS
} from '../../../utils/generatedLists'
import { curatedLists } from '../../../utils/curatedLists'
import { isCronAuthorized } from '../../../utils/auth'

export const config = { maxDuration: 60 }

const BATCH_SIZE = 3
const SLUG_PATTERN = /^[a-z0-9-]+$/

const DISCOVER_PARAM_ALLOWLIST = new Set([
  'with_genres',
  'with_keywords',
  'with_runtime.gte',
  'with_runtime.lte',
  'vote_average.gte',
  'vote_average.lte',
  'vote_count.gte',
  'vote_count.lte',
  'primary_release_date.gte',
  'primary_release_date.lte',
  'with_original_language',
  'sort_by'
])

// /discover/tv supports a different param set — no runtime filter, and air
// dates use first_air_date.* rather than primary_release_date.*.
const TV_DISCOVER_PARAM_ALLOWLIST = new Set([
  'with_genres',
  'with_keywords',
  'vote_average.gte',
  'vote_average.lte',
  'vote_count.gte',
  'vote_count.lte',
  'first_air_date.gte',
  'first_air_date.lte',
  'with_original_language',
  'with_origin_country',
  'with_networks',
  'with_type',
  'air_date.gte',
  'air_date.lte',
  'sort_by'
])

const GENRE_ID_LIST = Object.entries(movieGenres)
  .map(([slug, genre]) => `${genre.id}=${slug}`)
  .join(', ')

const TV_GENRE_ID_LIST = Object.entries(tvGenres)
  .map(([slug, genre]) => `${genre.id}=${slug}`)
  .join(', ')

let openai: OpenAI | undefined

type DiscoverDraft =
  | { error: string }
  | { error?: undefined; title: string; tagline: string; params: Record<string, string> }

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

async function draftTagline({ title, keyword, context }: { title: string; keyword: string; context?: string }): Promise<string | null> {
  const client = getOpenAI()
  if (!client) {
    return `Hand-picked picks for anyone searching "${keyword}".`
  }
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 80,
    temperature: 0.6,
    messages: [
      {
        role: 'system',
        content:
          'Write a single-sentence tagline (under 25 words) for a movie collection page. Plain, specific, no hype words like "ultimate" or "amazing", no movie facts you were not given.'
      },
      { role: 'user', content: `Collection title: "${title}". Target search phrase: "${keyword}". ${context || ''}` }
    ]
  })
  return completion.choices[0]?.message?.content?.trim() || null
}

async function resolveKeywordsParam(rawValue: unknown): Promise<string | null> {
  const names = (Array.isArray(rawValue) ? rawValue : String(rawValue).split('|'))
    .map((name) => String(name).trim())
    .filter(Boolean)
  const ids = await Promise.all(names.map(async (name) => (/^\d+$/.test(name) ? Number(name) : searchKeywordId(name))))
  const resolved = ids.filter(Boolean)
  return resolved.length ? resolved.join('|') : null
}

async function sanitizeDiscoverParams(rawParams: Record<string, unknown> = {}, media = 'movie'): Promise<Record<string, string>> {
  const allowlist = media === 'tv' ? TV_DISCOVER_PARAM_ALLOWLIST : DISCOVER_PARAM_ALLOWLIST
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawParams)) {
    if (!allowlist.has(key) || value === undefined || value === null || value === '') continue
    if (key === 'with_keywords') {
      const resolved = await resolveKeywordsParam(value)
      if (resolved) params[key] = resolved
      continue
    }
    params[key] = String(value)
  }
  return params
}

async function draftDiscoverList(seed: TopicSeed): Promise<DiscoverDraft> {
  const client = getOpenAI()
  if (!client) return { error: 'OPENAI_API_KEY is not configured' }

  const isTv = seed.media === 'tv'
  const allowlist = isTv ? TV_DISCOVER_PARAM_ALLOWLIST : DISCOVER_PARAM_ALLOWLIST
  const genreIdList = isTv ? TV_GENRE_ID_LIST : GENRE_ID_LIST

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          `You design a TMDB /discover/${isTv ? 'tv' : 'movie'} filter set for a ${isTv ? 'TV show' : 'movie'} collection page targeting a search keyword. Reply with JSON: {"title": string, "tagline": string, "params": object}. ` +
          'Title: 4-9 natural words containing the core phrase of the keyword. Tagline: one plain sentence under 25 words. ' +
          `params may only use these keys: ${[...allowlist].join(', ')}. ` +
          `with_genres takes TMDB ${isTv ? 'TV ' : ''}genre ids (${genreIdList}). ` +
          'with_keywords takes TMDB keyword names as an array (they get resolved to ids; only use well-known ones). ' +
          'Always include vote_count.gte >= 100 and sort_by. Prefer narrow-but-safe filters over broad ones.'
      },
      {
        role: 'user',
        content: JSON.stringify({ keyword: seed.keyword, hint: seed.hint || '' })
      }
    ]
  })

  const raw = completion.choices[0]?.message?.content
  let draft
  try {
    draft = JSON.parse(raw ?? '')
  } catch {
    return { error: 'Generator returned malformed JSON' }
  }

  if (!draft?.title || !draft?.tagline || typeof draft.params !== 'object') {
    return { error: 'Generator returned an incomplete draft' }
  }

  const params = await sanitizeDiscoverParams(draft.params, seed.media)
  if (Object.keys(params).length === 0) {
    return { error: 'Draft had no usable discover params' }
  }

  return { title: draft.title.trim(), tagline: draft.tagline.trim(), params }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const generated = await getGeneratedLists()
  if (Object.keys(generated).length >= MAX_GENERATED_LISTS) {
    return res.status(200).json({ skipped: true, reason: `Registry cap reached (${MAX_GENERATED_LISTS})` })
  }

  const statuses = await getSeedStatuses(topicSeeds.map((seed) => seed.slug))
  const forcedSlug = typeof req.query.seed === 'string' ? req.query.seed : null
  const pending = topicSeeds.filter((seed) => !statuses[seed.slug])
  const batch = forcedSlug
    ? topicSeeds.filter((seed) => seed.slug === forcedSlug)
    : pending.slice(0, BATCH_SIZE)

  if (forcedSlug && batch.length === 0) {
    return res.status(404).json({ error: `No seed found for "${forcedSlug}"` })
  }

  const results = []
  const existingSignatures = new Set(
    [...Object.values(curatedLists), ...Object.values(generated)]
      .map((list) => list.params && `${list.media || 'movie'}|${paramsSignature(list.params)}`)
      .filter(Boolean)
  )
  // movie and tv ids overlap in TMDB — source ids are namespaced by media.
  const existingMovieIds = new Set(
    Object.values(generated)
      .filter((list) => list.movieId)
      .map((list) => `${list.media || 'movie'}:${list.movieId}`)
  )

  for (const seed of batch) {
    if (!SLUG_PATTERN.test(seed.slug) || curatedLists[seed.slug] || generated[seed.slug]) {
      await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Slug invalid or already in use' })
      results.push({ slug: seed.slug, status: 'rejected', reason: 'slug conflict' })
      continue
    }

    try {
      const isTv = seed.media === 'tv'
      if (seed.type === 'similar') {
        const sourceTitle = seed.showTitle || seed.movieTitle || ''
        const source = isTv
          ? await searchTvByTitle(sourceTitle)
          : await searchMovieByTitle(sourceTitle)
        if (!source) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: `No TMDB match for "${sourceTitle}"` })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'title not found' })
          continue
        }
        const sourceKey = `${isTv ? 'tv' : 'movie'}:${source.id}`
        if (existingMovieIds.has(sourceKey)) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Duplicate source title' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'duplicate source' })
          continue
        }

        const data = isTv
          ? await fetchRecommendedTv(source.id)
          : await fetchRecommendedMovies(source.id)
        if ((data.results || []).length < MIN_INDEXABLE_MOVIES) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Too few recommendations' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'thin recommendations' })
          continue
        }

        const title = `${isTv ? 'Shows' : 'Movies'} Like ${source.title}`
        const tagline = await draftTagline({
          title,
          keyword: seed.keyword,
          context: `Source ${isTv ? 'show' : 'movie'}: ${source.title} (${source.release_date?.slice(0, 4) || 'n/a'}).`
        })
        if (!tagline) {
          results.push({ slug: seed.slug, status: 'skipped', reason: 'tagline generation failed' })
          continue
        }

        const saved = await saveGeneratedList(seed.slug, {
          type: 'similar',
          media: isTv ? 'tv' : 'movie',
          title,
          tagline,
          group: 'generated',
          movieId: source.id,
          movieTitle: source.title,
          keyword: seed.keyword,
          createdAt: Date.now()
        })
        if (!saved) {
          results.push({ slug: seed.slug, status: 'skipped', reason: 'registry cap reached' })
          continue
        }

        await setSeedStatus(seed.slug, { status: 'approved' })
        results.push({ slug: seed.slug, status: 'approved', title })
      } else {
        const draft = await draftDiscoverList(seed)
        if (draft.error !== undefined) {
          results.push({ slug: seed.slug, status: 'skipped', reason: draft.error })
          continue
        }

        const signature = `${isTv ? 'tv' : 'movie'}|${paramsSignature(draft.params)}`
        if (existingSignatures.has(signature)) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Duplicate discover params' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'duplicate params' })
          continue
        }

        const data = isTv
          ? await fetchListTv(draft.params)
          : await fetchListMovies(draft.params)
        if ((data.results || []).length < MIN_INDEXABLE_MOVIES) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Too few matching titles' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'thin results' })
          continue
        }

        const saved = await saveGeneratedList(seed.slug, {
          type: 'discover',
          media: isTv ? 'tv' : 'movie',
          title: draft.title,
          tagline: draft.tagline,
          group: 'generated',
          params: draft.params,
          keyword: seed.keyword,
          createdAt: Date.now()
        })
        if (!saved) {
          results.push({ slug: seed.slug, status: 'skipped', reason: 'registry cap reached' })
          continue
        }

        await setSeedStatus(seed.slug, { status: 'approved' })
        existingSignatures.add(signature)
        results.push({ slug: seed.slug, status: 'approved', title: draft.title })
      }
    } catch (err) {
      console.error(`Content generation failed for seed ${seed.slug}:`, err)
      results.push({ slug: seed.slug, status: 'error', reason: err instanceof Error ? err.message : String(err) })
    }
  }

  const summary = {
    processed: results.length,
    pendingRemaining: pending.length - results.length,
    approved: results.filter((r) => r.status === 'approved'),
    rejected: results.filter((r) => r.status === 'rejected'),
    skipped: results.filter((r) => r.status === 'skipped' || r.status === 'error')
  }
  await appendRunLog(summary)

  return res.status(200).json(summary)
}
