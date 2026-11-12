---
name: secret-hygiene
description: Verify secrets stay out of the repo, client bundle, logs, and emails — gitignore coverage, key-literal scans, git history checks, and the synckey-in-fragment convention. Use when asked to check for leaked secrets, before adding an API key, or after a suspected exposure.
---

# Secret hygiene

## Ignored files

`.gitignore` must keep covering: `.env*.local`, `.env*` (catches `.env`),
`.secrets*.json`, `.dev.vars`, `*.pem`, `.devin/mcp_config.local.json`,
`/social/`, `/shots/`.

```bash
# tracked files matching secret patterns (expect no output)
git ls-files | grep -iE '\.env|\.secrets|\.pem$|dev\.vars|credentials'

# stray secret files that slipped into the tree
fd -H -E node_modules -E .next -E .open-next 'secrets|credentials|\.env|\.pem$|dev\.vars'
```

## Literal scans

```bash
# private keys / JWTs / common key shapes in tracked source (expect only test fixtures)
git grep -nE 'BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{16,}' -- . ':(exclude)*.test.*'

# suspicious long literals assigned near key/secret/token names
git grep -inE "(secret|token|api_?key|password)['\"]?\s*[:=]\s*['\"][A-Za-z0-9/+=_-]{16,}" -- src scripts
```

`.secrets-gsc.json` and `~/.google_workspace_mcp/credentials/*` live outside
the repo by design — confirm nothing copied them in.

## Conventions to enforce

- Server secrets read via `process.env.X` only, typed in
  `src/types/env.d.ts`. New vars follow the `env-setup` skill: `.env.local` +
  `wrangler secret` + BOTH GitHub secret scopes (Actions AND Dependabot are
  separate stores).
- `NEXT_PUBLIC_*`, `next.config.ts` `env`/rewrite destinations, and anything
  under `public/` ships to browsers — never a secret (`ads.txt`, domain-verification
  txts are public by design).
- The alerts synckey travels in the URL FRAGMENT on outbound links
  (`plusLink`/`manageLink` in `features/billing/billing.ts`) — never `key=` in
  a query string on an emailed or externally-visible URL (referer/log leak),
  never `console.log` it, never in Umami events or error bodies. (API calls
  send it in query/body to our own routes — that's the model.)
- No secret VALUES in outbound messages (Resend/Telegram/Discord),
  `console.error`, thrown Errors, API responses, or workflow `echo`/`run`
  lines. Workflows reference `${{ secrets.X }}` only.
- Upstream keys go in headers or server-side fetch URLs — TMDB/Upstash/Polar
  tokens must not appear in any client-visible URL or rendered page.

## Suspected exposure

```bash
git log --all -S '<value>' --oneline   # was it ever committed?
```

If yes: rotate the secret FIRST — a committed secret is burned even after
deletion — then decide if history scrubbing is worth it. Single-author repo,
so `git filter-repo` is feasible but disruptive; rotation alone is usually
the answer. Report what was exposed, where it surfaced, and the commit range.
