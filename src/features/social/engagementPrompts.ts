// Rotating engagement-prompt pool for the weekly /api/cron/social-engagement
// job. `x` fits 280, `bsky` fits 300 (mastodon reuses it), `long` covers
// telegram/discord/facebook and the reddit stash. `title` is the reddit post
// title. Links bake channel UTM tags in — the adhoc broadcast does not tag
// text copy, only separate link fields.
export interface EngagementPrompt {
  title: string
  x: string
  bsky: string
  long: string
  link: string
}

const LEAVING = 'https://www.galaxymovies.app/leaving'
const utm = (channel: string) => `${LEAVING}?utm_source=${channel}&utm_medium=social&utm_campaign=engage`

export const ENGAGEMENT_PROMPTS: EngagementPrompt[] = [
  {
    title: "What's the movie that's been on your watchlist the longest?",
    x: `What's the movie that's been on your watchlist the longest?\n\nTitles leave Netflix, Hulu, Max and more every week, no warning. We track it daily: ${utm('x')}`,
    bsky: `What's the movie that's been on your watchlist the longest?\n\nTitles leave Netflix, Hulu, Max, Disney+ and more every week with zero warning. We track all of it: ${utm('bsky')}`,
    long: `What's the movie that's been on your watchlist the longest?\n\nStreaming licenses don't wait for you. Titles leave Netflix, Hulu, Max, Disney+, Prime Video and Apple TV+ every week, usually with zero warning.\n\nWe track all of it daily, so your watchlist stops quietly losing entries.\n\nCheck if yours is about to disappear:\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'What did you finally watch right before it left a service?',
    x: `What did you finally watch right before it left a service?\n\nOr what did you miss? Titles leave every week with no warning. We track the exits daily: ${utm('x')}`,
    bsky: `What did you finally watch right before it left a service?\n\nOr worse, what did you miss? Titles rotate off Netflix, Hulu, Max and more every week. We track the exits daily: ${utm('bsky')}`,
    long: `What did you finally watch right before it left a service?\n\nOr worse, what did you miss entirely? Every week titles quietly exit Netflix, Hulu, Max, Disney+, Prime Video and Apple TV+.\n\nWe track the comings and goings daily, so the next one doesn't get away.\n\nSee what's leaving this week:\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'How many streaming services are you paying for right now?',
    x: `How many streaming services are you paying for right now?\n\nAnd how many do you actually open? If a title's on a free service, you don't need to rent it: ${utm('x')}`,
    bsky: `How many streaming services are you paying for right now?\n\nAnd how many do you actually open? If a title's already on a free service, no need to rent it. Look it up first: ${utm('bsky')}`,
    long: `How many streaming services are you paying for right now?\n\nAnd how many do you actually open in a month? Most titles bounce between services, and plenty sit on free ones you already forgot you had.\n\nLook a title up before you rent it or subscribe for it: it shows every service currently carrying it, paid or free.\n\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'What movie do you recommend to everyone but nobody watches?',
    x: `What movie do you recommend to everyone but nobody watches?\n\nDrop it below. If it's streaming anywhere right now, you can check where: ${utm('x')}`,
    bsky: `What movie do you recommend to everyone but nobody watches?\n\nDrop it below, and check where it's streaming this week: ${utm('bsky')}`,
    long: `What movie do you recommend to everyone but nobody actually watches?\n\nDrop your pick below. And if you want to make it easy on them, look up where it's streaming right now, subscription or free:\n\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'Be honest: how big is your watchlist?',
    x: `Be honest: how big is your watchlist?\n\nOver 50? Over 200? Some of those titles leave services every week. See which: ${utm('x')}`,
    bsky: `Be honest: how big is your watchlist?\n\nOver 50? Over 200? Some of those titles quietly leave services every week. See which: ${utm('bsky')}`,
    long: `Be honest: how big is your watchlist?\n\nOver 50? Over 200? No judgment, same here. The problem is titles don't sit still: every week some of them leave Netflix, Hulu, Max and the rest.\n\nWe track the exits daily so you can watch the ones about to go first.\n\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'What was your last "it left Netflix mid-watch" loss?',
    x: `What was your last "it left mid-watch" loss?\n\nHalfway through a series and it was gone? We track departures so it doesn't happen again: ${utm('x')}`,
    bsky: `What was your last "it left mid-watch" loss?\n\nHalfway through a series and it was gone? We track departures across every service so it doesn't happen again: ${utm('bsky')}`,
    long: `What was your last "it left mid-watch" loss?\n\nHalfway through a series, queued for tonight, and it was just gone. Every week titles exit Netflix, Hulu, Max, Disney+, Prime Video and Apple TV+.\n\nWe track all of it daily. Next time you'll see it coming.\n\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'Do you check where something streams before you rent it?',
    x: `Do you check where a movie streams before you rent it?\n\nHalf the time it's already on a service you have, or free with ads. Look it up first: ${utm('x')}`,
    bsky: `Do you check where a movie streams before you rent it?\n\nHalf the time it's already on a service you have, or free with ads. A two-second lookup first: ${utm('bsky')}`,
    long: `Do you check where a movie streams before you rent it?\n\nHalf the time it's already on a subscription you pay for, or free with ads on Tubi or Pluto. A two-second lookup saves the rental fee.\n\nSearch any title, see every service carrying it:\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: 'What show are you rewatching for the third time?',
    x: `What show are you rewatching for the third time?\n\nAnd is it still on the same service? They move around. Check where it lives now: ${utm('x')}`,
    bsky: `What show are you rewatching for the third time?\n\nAnd is it still on the same service? They move around more than you'd think. Check where it lives now: ${utm('bsky')}`,
    long: `What show are you rewatching for the third time?\n\nAnd is it still on the same service as last year? They move around more than you'd think.\n\nLook it up, see every service carrying it right now:\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: "What's the best movie you found on a free streamer?",
    x: `What's the best movie you found on a free streamer?\n\nTubi, Pluto and Roku have legit libraries. Search a title, see if it's free right now: ${utm('x')}`,
    bsky: `What's the best movie you found on a free streamer?\n\nTubi, Pluto and Roku have legit libraries. Search a title, see if it's streaming free right now: ${utm('bsky')}`,
    long: `What's the best movie you found on a free streamer?\n\nTubi, Pluto TV and the Roku Channel have legit libraries and nobody checks them. Search any title and it shows every service carrying it, free-with-ads included:\n\n${utm('reddit')}`,
    link: LEAVING,
  },
  {
    title: "What's on your 'watch before it leaves' list this week?",
    x: `What's on your 'watch before it leaves' list this week?\n\nWe post the departures every week so nothing sneaks out. This week's: ${utm('x')}`,
    bsky: `What's on your 'watch before it leaves' list this week?\n\nWe post the weekly departures so nothing sneaks out on you. This week's exits: ${utm('bsky')}`,
    long: `What's on your 'watch before it leaves' list this week?\n\nEvery week we post the full departure list across Netflix, Hulu, Max, Disney+, Prime Video, Apple TV+ and more, so nothing sneaks out on you.\n\nThis week's exits:\n${utm('reddit')}`,
    link: LEAVING,
  },
]

export function engagementPromptForWeek(now = new Date()): EngagementPrompt {
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
  return ENGAGEMENT_PROMPTS[week % ENGAGEMENT_PROMPTS.length]
}
