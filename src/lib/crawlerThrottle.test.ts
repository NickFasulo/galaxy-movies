import { describe, expect, it, vi } from 'vitest'
import { crawlerBudgetName, checkCrawlerBudget } from './crawlerThrottle'
import { getRedis } from './redis'

vi.mock('./redis', () => ({ getRedis: vi.fn(() => null) }))

describe('crawlerBudgetName', () => {
  it.each([
    ['Mozilla/5.0 AppleWebKit/537.36 (compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)', 'ai_claude'],
    ['Mozilla/5.0 AppleWebKit/537.36 (compatible; Claude-User/1.0)', 'ai_claude'],
    ['Mozilla/5.0 (compatible; OAI-SearchBot/1.0)', 'ai_openai'],
    ['Mozilla/5.0 (compatible; ChatGPT-User/1.0)', 'ai_openai'],
    ['Mozilla/5.0 (compatible; PerplexityBot/1.0)', 'ai_perplexity'],
    ['Mozilla/5.0 (compatible; Perplexity-User/1.0)', 'ai_perplexity'],
    ['Mozilla/5.0 AppleWebKit/537.36 (compatible; Amzn-SearchBot/0.1)', 'ai_amazon'],
    ['Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://crawler.exa.ai/)', 'ai_exa']
  ])('maps %s to %s', (ua, expected) => {
    expect(crawlerBudgetName(ua)).toBe(expected)
  })

  it.each([
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'bingbot/2.0',
    'Applebot/0.1',
    'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'Mozilla/5.0 (compatible; GPTBot/1.0)',
    'facebookexternalhit/1.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
    'curl/8.0'
  ])('leaves %s unthrottled', (ua) => {
    expect(crawlerBudgetName(ua)).toBeNull()
  })

  it.each([null, undefined, ''])('treats %s as unthrottled', (ua) => {
    expect(crawlerBudgetName(ua)).toBeNull()
  })
})

describe('checkCrawlerBudget', () => {
  it('allows unlisted user agents without touching Redis', async () => {
    await expect(checkCrawlerBudget('Googlebot/2.1')).resolves.toBe(true)
    expect(vi.mocked(getRedis)).not.toHaveBeenCalled()
  })

  it('allows a listed crawler while under budget', async () => {
    await expect(checkCrawlerBudget('Claude-SearchBot/1.0')).resolves.toBe(true)
  })
})
