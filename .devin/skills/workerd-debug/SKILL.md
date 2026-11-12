---
name: workerd-debug
description: Debug the three workerd-vs-Node render traps — the __name stringify crash, UTC hydration mismatches (React #418), and the notFound/404 gap — with the reproduction path. Use when a page works under next dev but breaks under wrangler dev or prod, or e2e:workerd fails.
---

# Debugging workerd render traps

`next dev` runs Node; production runs Cloudflare's workerd via
`@opennextjs/cloudflare`. Three failure classes hide from curl smoke and
Node dev — all were caught by the e2e suite. Reproduce first:

```bash
npm run cf:build && npm run cf:preview     # or npm run test:e2e:workerd
```

## Trap 1: "module factory is not available" / function-stringify crash

**Cause**: emitting `<script>` whose source comes from a function's
`.toString()`. OpenNext's esbuild `keepNames` rewrites inner functions to
`__name(fn, "...")` wrappers — which stringify as `__name(...)` and crash in
the browser where `__name` doesn't exist. This is why `next-themes` is gone
and `_document.tsx` stamps `class="dark"` + `color-scheme` statically.

**Check for**: any `dangerouslySetInnerHTML` script built from
`` `${someFn}` `` or `someFn.toString()`, and any dependency that does it
internally (next-themes was the example). Fix: write the script as a static
string, or inline the logic.

## Trap 2: React hydration mismatch (#418 / text content diff)

**Cause**: locale/TZ-dependent output. SSR runs in UTC; the browser hydrates
in the viewer's timezone — `toLocaleDateString`, `new Date()` month labels,
relative times all differ.

**Fix**: pin `timeZone: 'UTC'` (and an explicit locale) everywhere user-visible
dates/times format — `src/lib/format/formatters.ts`'s `dateFormatter` is the
pattern. Audit any new date/number formatting, especially in components that
SSR.

## Trap 3: `notFound` renders the built-in 404

**Cause**: OpenNext gap — `notFound: true` on dynamic routes renders Next's
stock 404 under workerd, not `pages/404.tsx`. Not a bug to fix in code;
e2e asserts status + generic not-found copy instead of the branded page.

## Other workerd constraints (when the trap isn't one of the three)

- **No Node built-ins**: `fs`, TCP sockets — all upstream is fetch
  (Upstash REST, OpenAI, Resend). `/api/og` imports `@vercel/og`'s *edge*
  entry on workerd (`navigator.userAgent === 'Cloudflare-Workers'`) because
  the node entry uses `readFileSync` + runtime `WebAssembly.instantiate`.
- **`fs` cwd is `/bundle`** — assets must be copied into `.open-next/public`
  by the postbuild script, not read from `public/`.
- **ESM behind `workerd` export conditions** — `useWorkerdCondition`
  externals force-copy those packages (emotion/uncrypto). An import that
  works locally but resolves wrong in the bundle is this.

If a page is broken under workerd and none of these fit: `wrangler tail`
while hitting it — the isolate's exception is usually explicit.
