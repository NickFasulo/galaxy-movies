declare namespace NodeJS {
  interface ProcessEnv {
    TMDB_API_KEY?: string
    OPENAI_API_KEY?: string
    WATCHMODE_API_KEY?: string
    WATCHMODE_DAILY_LOOKUP_BUDGET?: string
    UPSTASH_REDIS_KV_REST_API_URL?: string
    UPSTASH_REDIS_KV_REST_API_TOKEN?: string
    RESEND_API_KEY?: string
    RESEND_FROM?: string
    CRON_SECRET?: string
    TAKEADS_PUBLIC_KEY?: string
    NEXT_PUBLIC_SITE_URL?: string
    NEXT_PUBLIC_UMAMI_WEBSITE_ID?: string
    NEXT_PUBLIC_UMAMI_SRC?: string
  }
}
