# Galaxy Movies

Next.js 15 Pages Router app (React 18, Chakra UI, React Query v3). All application code is strict TypeScript under `src/` — `allowJs` is off, so new source files must be `.ts`/`.tsx`.

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint flat config (`eslint.config.mjs`, `next/core-web-vitals` + `next/typescript`)
- `npm run check` — typecheck + production build
- `npm run dev` — dev server on :3000
- `npm run lhci` — build + Lighthouse CI (`lighthouserc.cjs`)

## Conventions

- Shared TMDB/API types live in `src/types/tmdb.ts`; env var declarations in `src/types/env.d.ts`.
- Detail pages with server-side error props split the error view into a separate component so hooks never run conditionally (see `CompanyContent`/`CompanyErrorView` pattern).
- `src/pages/api/og.tsx` renders `@vercel/og` markup — raw `<img>` is required there and ESLint rules are disabled for that file only.
- `scripts/` is plain JS build tooling, excluded from tsconfig and ESLint.

## Environment

Copy `.env.example` (if present) or set: `TMDB_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `UPSTASH_REDIS_KV_REST_API_URL`, `UPSTASH_REDIS_KV_REST_API_TOKEN`, `OPENAI_API_KEY`, `WATCHMODE_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `TAKEADS_PUBLIC_KEY`. Without `TAKEADS_PUBLIC_KEY`, watch-provider links fall back to plain provider homepages instead of affiliate tracking links. Optional: `WATCHMODE_DAILY_LOOKUP_BUDGET` (default 300), `RESEND_FROM`. Never commit `.env.local`.

For OpenAI spend/usage reporting, run `OPENAI_ADMIN_KEY=... node scripts/openai-usage.js [days]` — requires an org admin key, not the runtime `OPENAI_API_KEY`. Optional: `OPENAI_MODEL` overrides the shared model in `src/utils/openai.ts` (default `gpt-6-luna`, `reasoning_effort: none`); bump the `*_CACHE_VERSION` constants when switching models so cached generations don't mix.
