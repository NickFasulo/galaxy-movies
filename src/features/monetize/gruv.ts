import type { MediaType } from '../../types/tmdb'

export interface GruvProduct {
  url: string
  title: string
}

interface SuggestProduct {
  title?: string
  url?: string
  available?: boolean
}

const SUGGEST_URL = 'https://gruv.com/search/suggest.json'

// Gruv is Shopify: suggest.json does fuzzy matching (a "jaws" query leads with
// Jaws 3, "the mummy" returns Abbott & Costello), so products must be
// title-verified before they're linkable.
const PAREN_GROUP = /[([][^\])]*[\])]/g
const PAREN_YEAR = /\b(?:19|20)\d{2}\b/g

// Format/edition descriptors Gruv appends outside the bracketed groups.
const EDITION_TOKENS = new RegExp(
  `\\b(?:${[
    '4k ultra hd',
    'ultra hd',
    'uhd',
    '4k',
    'blu ray',
    'bluray',
    'dvd',
    '3d',
    'digital hd',
    'digital copy',
    'digital code',
    'digital',
    'hd',
    'steelbook',
    'box set',
    'boxset',
    'new box art',
    'anniversary edition',
    'collectors edition',
    'limited edition',
    'special edition',
    'deluxe edition',
    'extended edition',
    'extended cut',
    'edition',
    'anniversary',
    'limited',
    'deluxe',
    'collectors',
    'special',
    'unrated',
    'extended',
    'directors cut',
    'restored',
    'remastered',
    'widescreen',
    'repackaged',
    '\\d+(?:st|nd|rd|th)'
  ].join('|')})\\b`,
  'g'
)

const normalizeTitle = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;|&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const stripParens = (s: string) => {
  let out = s
  for (let i = 0; i < 3; i++) {
    const next = out.replace(PAREN_GROUP, ' ')
    if (next === out) break
    out = next
  }
  return out
}

const stripEdition = (norm: string) => norm.replace(EDITION_TOKENS, ' ').replace(/\s+/g, ' ').trim()

// TV box sets subtitle the show name ("The Office: The Complete Series"), so
// the pre-colon segment is a valid base when the subtitle describes a set —
// never a movie base, since sequels use subtitles ("Tokyo Drift").
const TV_SET_SUBTITLE = /^(the )?(complete )?(series|seasons?|collections?|volumes?|vol|parts?|episodes?|books?|chapters?|box)\b/

function analyzeProduct(title: string, mediaType: MediaType) {
  const parenText = (title.match(PAREN_GROUP) || []).join(' ')
  const years = new Set(parenText.match(PAREN_YEAR) || [])
  const main = stripParens(title)
  const bases = [stripEdition(normalizeTitle(main))]
  if (mediaType === 'tv') {
    const colon = main.indexOf(':')
    if (colon > 0 && TV_SET_SUBTITLE.test(normalizeTitle(main.slice(colon + 1)))) {
      bases.unshift(stripEdition(normalizeTitle(main.slice(0, colon))))
    }
  }
  return { years, bases }
}

export function matchGruvProduct(products: SuggestProduct[], { title, year, mediaType = 'movie' }: {
  title: string
  year?: string | number | null
  mediaType?: MediaType
}): GruvProduct | null {
  const titleNorm = stripEdition(normalizeTitle(stripParens(title)))
  if (!titleNorm) return null
  const releaseYear = mediaType === 'movie' && /^\d{4}$/.test(String(year ?? '')) ? String(year) : null

  const candidates = products
    .map((p) => ({ p, ...analyzeProduct(String(p.title || ''), mediaType) }))
    .filter((c) => c.p.available !== false && c.bases.includes(titleNorm))

  // A year-less "The Mummy" disc is ambiguous when the catalog also carries
  // "(1999)"/"(2017)" editions — only trust it when no tagged variant exists.
  const hasConflictingYear = candidates.some((c) => c.years.size > 0 && !c.years.has(releaseYear || ''))

  for (const c of candidates) {
    if (releaseYear && c.years.size > 0 && !c.years.has(releaseYear)) continue
    if (releaseYear && c.years.size === 0 && hasConflictingYear) continue
    const path = String(c.p.url || '').split('?')[0]
    if (!path.startsWith('/products/')) continue
    return { url: `https://gruv.com${path}`, title: String(c.p.title) }
  }
  return null
}

async function suggest(query: string): Promise<SuggestProduct[]> {
  try {
    const params = new URLSearchParams({ q: query })
    params.set('resources[type]', 'product')
    params.set('resources[limit]', '10')
    const resp = await fetch(`${SUGGEST_URL}?${params}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000)
    })
    if (!resp.ok) return []
    const data = await resp.json()
    const products = data?.resources?.results?.products
    return Array.isArray(products) ? products : []
  } catch {
    return []
  }
}

export async function resolveGruvProduct({ title, year, mediaType = 'movie' }: {
  title?: string | null
  year?: string | number | null
  mediaType?: MediaType
}): Promise<GruvProduct | null> {
  const clean = String(title || '').trim()
  if (!clean) return null
  // Bare title first — "oppenheimer 2023" returns empty because products lack
  // the year token — but "the mummy" alone ranks Abbott & Costello above the
  // real film, so a year-qualified retry rescues those cases.
  const queries = mediaType === 'movie' && year ? [clean, `${clean} ${year}`] : [clean]
  for (const q of queries) {
    const match = matchGruvProduct(await suggest(q), { title: clean, year, mediaType })
    if (match) return match
  }
  return null
}
