import { aiParams, getOpenAIClient, isQuotaError, markAiUnavailable, recordAiUsage } from '../ai/openai'
import { queryAnalytics, reportWindows, type AnalyticsRow } from './gscAnalytics'
import { SITE_URL } from '../../lib/site'

export interface CtrSuggestion {
  page: string
  query: string | null
  title: string
  description: string
}

// Monthly companion to ctrGaps: for each gap page pull the query driving its
// impressions (the phrase the snippet must answer), then draft one tighter
// title/description pair. Advisory only — rendered in the weekly email for a
// human to apply; titles are product decisions and never auto-written.
export async function suggestCtrRewrites(gaps: AnalyticsRow[], limit = 5): Promise<CtrSuggestion[]> {
  const top = gaps.slice(0, limit)
  if (!top.length) return []

  const { month } = reportWindows()
  const queries = await Promise.all(
    top.map((g) =>
      queryAnalytics(month.start, month.end, { dimensions: ['query'], rowLimit: 1, page: g.keys[0] })
        .then((rows) => rows[0]?.keys[0] ?? null)
        .catch(() => null)
    )
  )
  const base: CtrSuggestion[] = top.map((g, i) => ({ page: g.keys[0], query: queries[i], title: '', description: '' }))

  const client = getOpenAIClient()
  if (!client) return base

  const t0 = Date.now()
  let completion
  try {
    completion = await client.chat.completions.create({
      ...aiParams('ctr', 500, 0.6),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ctr_rewrites',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    page: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['page', 'title', 'description'],
                  additionalProperties: false
                }
              }
            },
            required: ['pages'],
            additionalProperties: false
          }
        }
      },
      messages: [
        {
          role: 'system',
          content:
            'You write search snippets for galaxymovies.app, a "where to watch" streaming-availability site. For each page and its dominant query, produce one <title> (under 60 chars, front-load the query phrase, e.g. "Where to Watch X" or "X Release Date") and one meta description (under 160 chars, concrete: which services carry it, dates, or the get-alerted hook). No hype, no caps spam, no claims the data cannot support. Return one object per input page, same order.'
        },
        { role: 'user', content: JSON.stringify({ pages: base.map((b) => ({ page: b.page.replace(SITE_URL, ''), query: b.query })) }) }
      ]
    })
  } catch (err) {
    if (isQuotaError(err)) markAiUnavailable()
    return base
  }
  recordAiUsage('ctr', completion.usage, { latencyMs: Date.now() - t0 })

  let suggestions: { page?: string; title?: string; description?: string }[] = []
  try {
    suggestions = JSON.parse(completion.choices[0]?.message?.content ?? '')?.pages || []
  } catch {
    return base
  }
  return base.map((b, i) => ({ ...b, title: suggestions[i]?.title || '', description: suggestions[i]?.description || '' }))
}
