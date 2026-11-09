# Spec: WordPress plugin `galaxy-movies-embeds`

A wp.org-listed plugin wrapping the existing `/embed/*` iframes in a shortcode + optional block. Puts the widgets in front of the WP plugin-directory audience — every install is a live "Powered by Galaxy Movies" badge on someone's site. Free distribution.

## Scope

```
galaxy-movies-embeds/
  galaxy-movies-embeds.php   # header, shortcode, optional block registration
  readme.txt                 # wp.org format
  block/block.json           # optional Gutenberg block (v1.1 ok)
  block/index.js
```

Lives in its own repo (`galaxy-movies-wp`) or a `wp/` dir of the extension repo — the release artifact is the same zip either way. GPL-2.0+ (required for the directory).

## Shortcode

`[galaxy provider="netflix" theme="dark" kind="changes" height="380"]`

- `provider` — validated against a hardcoded array mirroring `embeddableProviders()` (~20 keys, e.g. `netflix`, `hulu`, `disney-plus`, `max`, `apple-tv`, `tubi`, …). Unknown → comment in HTML source + admin-facing `current_user_can` notice, never a PHP fatal.
- `theme` — `dark|light`, maps to the existing `?theme=light` param.
- `kind` — `changes` → `/embed/{provider}`; `churn` → `/embed/churn`.
- `height` — int px, clamped 200–900, default 380.
- Output: escaped `<iframe src="{esc_url}" height="{h}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" style="border:0;width:100%"></iframe>` — `esc_url`, `esc_attr`, `absint` throughout (wp.org review checks this).

## Block (optional v1.1)

`block.json` `"name": "galaxy-movies/embed"`, attributes matching the shortcode, server-render (`render_callback`) so no build step — `register_block_type` + an edit component that just renders the iframe preview or a placeholder.

## readme.txt essentials

```
=== Galaxy Movies — Streaming Arrivals & Departures ===
Contributors: galaxymovies
Tags: streaming, netflix, movies, tv, embed
Requires at least: 6.0
Tested up to: {current}
Stable tag: 1.0.0
License: GPLv2 or later
```

Description states what it does ("daily updated new & leaving lists for 20 streaming services"), the iframe behavior, and that data comes from galaxymovies.app (wp.org requires disclosing remote calls — iframe counts). Screenshots: widget on a post in dark + light theme.

## Distribution

1. Account on wordpress.org → "Add your plugin" → zip upload → review (typically days).
2. Approved → SVN repo (`svn co`), commit trunk + `assets/` (icon-256, banner-1544x500 — reuse `public/icons` + a `backdrop_fallback` render; no new art pipeline).
3. Tag releases: bump `Stable tag` in readme + version constant.

## Verify

- `php -l` clean; activate on a WP 6.x sandbox (localwp or a free taste-wp site).
- `[galaxy provider="netflix"]` renders the live iframe; bad provider → no output for visitors, notice for admins.
- `kind="churn"` renders the churn card; `theme="light"` shows the light palette.
- No console errors; `Plugin Check` (wordpress.org tool) warnings resolved before submit.
