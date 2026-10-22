import { checkGlobalBudget } from './rateLimiter'

// Referral-capable AI crawlers — search/assistant bots that can send users —
// get a shared hourly budget per family instead of a hard block. Training-only
// crawlers (ClaudeBot, GPTBot, CCBot, ...) are blocked at the edge instead and
// never reach this. Search engines (Googlebot/Bingbot/...) stay unlimited:
// their indexing is worth more than the requests cost.
const CRAWLER_BUDGETS: [RegExp, string][] = [
  [/claude-searchbot|claude-user/i, 'ai_claude'],
  [/oai-searchbot|chatgpt-user/i, 'ai_openai'],
  [/perplexitybot|perplexity-user/i, 'ai_perplexity'],
  [/amzn-searchbot/i, 'ai_amazon'],
  [/exasearchbot/i, 'ai_exa']
]

const CRAWLER_BUDGET_MAX = 600
const CRAWLER_BUDGET_WINDOW_S = 60 * 60

export function crawlerBudgetName(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const match = CRAWLER_BUDGETS.find(([pattern]) => pattern.test(userAgent))
  return match ? match[1] : null
}

export function checkCrawlerBudget(userAgent: string | null | undefined): Promise<boolean> {
  const name = crawlerBudgetName(userAgent)
  if (!name) return Promise.resolve(true)
  return checkGlobalBudget(name, { maxRequests: CRAWLER_BUDGET_MAX, windowSeconds: CRAWLER_BUDGET_WINDOW_S })
}
