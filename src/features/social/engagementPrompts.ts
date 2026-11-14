import promptData from './engagementPrompts.data.json'

// Rotating engagement-prompt pool — `title` (the bare question) closes the
// weekly digest broadcast; the full bodies back manual adhoc posts via
// /api/cron/social-post. Data lives in engagementPrompts.data.json so
// scripts/generate-tiktok-video.js (plain CJS, can't import TS) reads the
// same pool for the Thursday question video. `x` fits 280, `bsky` fits 300
// (mastodon reuses it), `long` covers telegram/discord/facebook and the
// reddit stash. `{link}` in each body is swapped for the channel's UTM-tagged
// URL at build time — the adhoc broadcast does not tag text copy, only
// separate link fields.
export interface EngagementPrompt {
  title: string
  videoSub: string
  x: string
  bsky: string
  long: string
  link: string
}

const LEAVING = 'https://www.galaxymovies.app/leaving'
const utm = (channel: string) => `${LEAVING}?utm_source=${channel}&utm_medium=social&utm_campaign=engage`

const bake = (body: string, channel: string) => body.replace('{link}', utm(channel))

export const ENGAGEMENT_PROMPTS: EngagementPrompt[] = promptData.map((p) => ({
  title: p.title,
  videoSub: p.videoSub,
  x: bake(p.x, 'x'),
  bsky: bake(p.bsky, 'bsky'),
  long: bake(p.long, 'reddit'),
  link: LEAVING,
}))

export function engagementPromptForWeek(now = new Date()): EngagementPrompt {
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
  return ENGAGEMENT_PROMPTS[week % ENGAGEMENT_PROMPTS.length]
}
