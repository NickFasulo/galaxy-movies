# Galaxy Movies Content Pipeline Starter

This starter pipeline focuses on one page family first: `Best [genre] movies on [provider]`.

## 1. Search Intent

Target people searching for streaming-specific recommendations, such as:

- best horror movies on Netflix
- best comedy movies on Prime Video
- family movies on Disney+
- documentaries on Hulu

## 2. Data Source

Each page combines existing TMDB discover data:

- `with_watch_providers`
- `watch_region`
- `with_genres`
- poster-backed movie results only

## 3. Template

The route lives at:

- `/streaming/[provider]/[genre]`

Each page gets a generated title, meta description, canonical URL, ItemList schema, breadcrumbs, and links back to the broader provider and genre pages.

## 4. Quality Gate

The current gate is intentionally simple:

- Pages with fewer than 8 matching movies get `noindex,follow`.
- Pages with temporary data errors get `noindex,follow`.
- Eligible page combinations are defined in `src/utils/contentOpportunities.js`.

## 5. Internal Links

Provider pages link to the approved genre pages for that provider. This makes the page family crawlable before relying on sitemap discovery.

## 6. Sitemap

Eligible provider/genre targets are added to `sitemap.xml` through the same content registry.

## 7. Next Iterations

- Add Search Console data to choose which provider/genre pages deserve custom intros.
- Add an editorial note field for the highest-value combinations.
- Create a weekly report of pages with impressions but low CTR.
- Add a pruning script that flags pages with low result counts or stale availability.
