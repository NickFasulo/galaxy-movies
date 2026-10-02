import OpenAI from 'openai'
import { topicSeeds } from '../../../utils/topicSeeds'
import {
  fetchListMovies,
  fetchRecommendedMovies,
  movieGenres,
  searchKeywordId,
  searchMovieByTitle
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

const GENRE_ID_LIST = Object.entries(movieGenres)
  .map(([slug, genre]) => `${genre.id}=${slug}`)
  .join(', ')

let openai

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null
  openai = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

async function draftTagline({ title, keyword, context }) {
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

async function resolveKeywordsParam(rawValue) {
  const names = (Array.isArray(rawValue) ? rawValue : String(rawValue).split('|'))
    .map((name) => String(name).trim())
    .filter(Boolean)
  const ids = await Promise.all(names.map(async (name) => (/^\d+$/.test(name) ? Number(name) : searchKeywordId(name))))
  const resolved = ids.filter(Boolean)
  return resolved.length ? resolved.join('|') : null
}

async function sanitizeDiscoverParams(rawParams = {}) {
  const params = {}
  for (const [key, value] of Object.entries(rawParams)) {
    if (!DISCOVER_PARAM_ALLOWLIST.has(key) || value === undefined || value === null || value === '') continue
    if (key === 'with_keywords') {
      const resolved = await resolveKeywordsParam(value)
      if (resolved) params[key] = resolved
      continue
    }
    params[key] = String(value)
  }
  return params
}

async function draftDiscoverList(seed) {
  const client = getOpenAI()
  if (!client) return { error: 'OPENAI_API_KEY is not configured' }

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You design a TMDB /discover/movie filter set for a movie collection page targeting a search keyword. Reply with JSON: {"title": string, "tagline": string, "params": object}. ' +
          'Title: 4-9 natural words containing the core phrase of the keyword. Tagline: one plain sentence under 25 words. ' +
          `params may only use these keys: ${[...DISCOVER_PARAM_ALLOWLIST].join(', ')}. ` +
          `with_genres takes TMDB genre ids (${GENRE_ID_LIST}). ` +
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
    draft = JSON.parse(raw)
  } catch {
    return { error: 'Generator returned malformed JSON' }
  }

  if (!draft?.title || !draft?.tagline || typeof draft.params !== 'object') {
    return { error: 'Generator returned an incomplete draft' }
  }

  const params = await sanitizeDiscoverParams(draft.params)
  if (Object.keys(params).length === 0) {
    return { error: 'Draft had no usable discover params' }
  }

  return { title: draft.title.trim(), tagline: draft.tagline.trim(), params }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
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
      .map((list) => list.params && paramsSignature(list.params))
      .filter(Boolean)
  )
  const existingMovieIds = new Set(
    Object.values(generated).map((list) => list.movieId).filter(Boolean)
  )

  for (const seed of batch) {
    if (!SLUG_PATTERN.test(seed.slug) || curatedLists[seed.slug] || generated[seed.slug]) {
      await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Slug invalid or already in use' })
      results.push({ slug: seed.slug, status: 'rejected', reason: 'slug conflict' })
      continue
    }

    try {
      if (seed.type === 'similar') {
        const movie = await searchMovieByTitle(seed.movieTitle)
        if (!movie) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: `No TMDB match for "${seed.movieTitle}"` })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'movie not found' })
          continue
        }
        if (existingMovieIds.has(movie.id)) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Duplicate source movie' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'duplicate movie' })
          continue
        }

        const data = await fetchRecommendedMovies(movie.id)
        if ((data.results || []).length < MIN_INDEXABLE_MOVIES) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Too few recommendations' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'thin recommendations' })
          continue
        }

        const title = `Movies Like ${movie.title}`
        const tagline = await draftTagline({
          title,
          keyword: seed.keyword,
          context: `Source movie: ${movie.title} (${movie.release_date?.slice(0, 4) || 'n/a'}).`
        })
        if (!tagline) {
          results.push({ slug: seed.slug, status: 'skipped', reason: 'tagline generation failed' })
          continue
        }

        const saved = await saveGeneratedList(seed.slug, {
          type: 'similar',
          title,
          tagline,
          group: 'generated',
          movieId: movie.id,
          movieTitle: movie.title,
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
        if (draft.error) {
          results.push({ slug: seed.slug, status: 'skipped', reason: draft.error })
          continue
        }

        const signature = paramsSignature(draft.params)
        if (existingSignatures.has(signature)) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Duplicate discover params' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'duplicate params' })
          continue
        }

        const data = await fetchListMovies(draft.params)
        if ((data.results || []).length < MIN_INDEXABLE_MOVIES) {
          await setSeedStatus(seed.slug, { status: 'rejected', reason: 'Too few matching movies' })
          results.push({ slug: seed.slug, status: 'rejected', reason: 'thin results' })
          continue
        }

        const saved = await saveGeneratedList(seed.slug, {
          type: 'discover',
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
      results.push({ slug: seed.slug, status: 'error', reason: err.message })
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
