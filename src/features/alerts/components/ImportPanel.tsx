import { useRef, useState } from 'react'
import { Button, Flex, Text } from '@chakra-ui/react'
import { secondaryButton } from '../../../theme'
import { parseLetterboxdCsv } from '../../../lib/format/importLetterboxd'
import { parseTvTimeCsvs } from '../../../lib/format/importTvTime'
import { unzipEntries } from '../../../lib/format/unzip'
import { getUserData, mergeSyncedPrefs, type SyncedPrefs } from '../../../lib/userData'
import { scheduleAlertsSync } from '../alertsSync'
import type { MediaType } from '../../../types/tmdb'

// One-shot inbound imports are free: they're an acquisition hook for migrants
// from dead/bloated trackers, not an ongoing cost. Everything parses on-device
// — the only network call is bounded title resolution (50/batch, IP-limited).

interface ImportItem {
  title: string
  year?: string
  tvdbId?: number
  mediaType: MediaType
  rating?: number
  watchedAt?: string
  episodes?: number
  lastEpisode?: string
}

interface ResolvedTitle {
  id: number
  mediaType: MediaType
  title: string
  year?: string
  poster_path: string | null
}

const TV_TIME_CSV_NAMES = new Set([
  'followed_tv_show.csv',
  'user_tv_show_data.csv',
  'tracking-prod-records.csv',
  'tracking-prod-records-v2.csv',
  'ratings-live-votes.csv',
  'seen_episode_latest.csv',
  'watched_on_episode.csv',
  'rewatched_episode.csv'
])

async function resolveItems(items: ImportItem[]): Promise<(ResolvedTitle | null)[]> {
  const resolved: (ResolvedTitle | null)[] = []
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50)
    const resp = await fetch('/api/resolve-titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: batch.map(({ title, year, tvdbId }) => ({ title, year, tvdbId })) }),
      signal: AbortSignal.timeout(30_000)
    })
    const data = await resp.json().catch(() => ({}))
    const results = Array.isArray(data?.results) ? data.results : []
    batch.forEach((_, j) => resolved.push(results[j]?.resolved ?? null))
  }
  return resolved
}

// Letterboxd's Name/Year/Letterboxd URI header is distinctive; TV Time files
// are routed by name because emotions-live-votes.csv shares a header with
// ratings-live-votes.csv.
function detectCsv(name: string, text: string): 'tvtime' | 'letterboxd' | 'unknown' {
  if (TV_TIME_CSV_NAMES.has(name.toLowerCase())) return 'tvtime'
  const header = text.slice(0, text.indexOf('\n') + 1 || undefined).toLowerCase()
  if (header.includes('letterboxd uri')) return 'letterboxd'
  return 'unknown'
}

function mergeItems(batches: ImportItem[][], resolved: (ResolvedTitle | null)[][]): SyncedPrefs {
  const [wl, rt, wt] = resolved
  return {
    watchlist: wl
      .map((r, i) => (r ? { id: r.id, mediaType: r.mediaType, title: r.title, poster_path: r.poster_path, year: r.year ?? batches[0][i]!.year ?? null } : null))
      .filter((r): r is NonNullable<typeof r> => Boolean(r)),
    ratings: rt
      .map((r, i) =>
        r && batches[1][i]!.rating
          ? { id: r.id, mediaType: r.mediaType, title: r.title, rating: batches[1][i]!.rating, poster_path: r.poster_path, year: r.year ?? batches[1][i]!.year ?? null }
          : null
      )
      .filter((r): r is NonNullable<typeof r> => Boolean(r)),
    watched: wt
      .map((r, i) =>
        r
          ? {
              id: r.id,
              mediaType: r.mediaType,
              title: r.title,
              poster_path: r.poster_path,
              year: r.year ?? batches[2][i]!.year ?? null,
              watched_at: batches[2][i]!.watchedAt || '',
              episodes: batches[2][i]!.episodes,
              lastEpisode: batches[2][i]!.lastEpisode
            }
          : null
      )
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
  }
}

export default function ImportPanel({ source }: { source?: 'tvtime' }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const importFiles = (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setNote('')
    void (async () => {
      const watchlistItems: ImportItem[] = []
      const ratingItems: ImportItem[] = []
      const watchedItems: ImportItem[] = []
      // TV Time files parse as one set: ratings-live-votes joins tracking
      // rows by uuid, which only works when every CSV is in the same bucket.
      const tvTimeCsvs: { name: string; text: string }[] = []
      let ignored = 0

      try {
        for (const file of Array.from(files)) {
          if (/\.zip$/i.test(file.name)) {
            const entries = await unzipEntries(new Uint8Array(await file.arrayBuffer()))
            for (const entry of entries) {
              if (entry.name.toLowerCase().endsWith('.csv')) tvTimeCsvs.push({ name: entry.name, text: new TextDecoder().decode(entry.data) })
            }
            continue
          }

          const text = await file.text()
          const kind = detectCsv(file.name, text)
          if (kind === 'tvtime') {
            tvTimeCsvs.push({ name: file.name, text })
          } else if (kind === 'letterboxd' || file.name.toLowerCase().endsWith('.csv')) {
            const items = parseLetterboxdCsv(text)
            if (!items.length) {
              ignored++
              continue
            }
            const lower = file.name.toLowerCase()
            if (lower.includes('rating')) ratingItems.push(...items.map((i) => ({ ...i, mediaType: 'movie' as const })))
            else if (lower.includes('diary') || lower.includes('watched')) {
              watchedItems.push(...items.map((i) => ({ ...i, watchedAt: i.date, mediaType: 'movie' as const })))
            } else watchlistItems.push(...items.map((i) => ({ ...i, mediaType: 'movie' as const })))
          } else {
            ignored++
          }
        }
      } catch {
        setNote('Could not read that file: pick the TV Time export ZIP or its CSV files.')
        setBusy(false)
        return
      }

      const parsed = parseTvTimeCsvs(tvTimeCsvs)
      watchlistItems.push(...parsed.watchlist)
      ratingItems.push(...parsed.ratings)
      watchedItems.push(...parsed.watched)
      const skippedWatched = parsed.skippedWatched
      ignored += parsed.filesIgnored

      if (!watchlistItems.length && !ratingItems.length && !watchedItems.length) {
        setNote(
          ignored
            ? 'No importable rows found: those files have nothing Galaxy Movies tracks.'
            : 'No importable rows found: use a TV Time export ZIP/CSVs or Letterboxd watchlist.csv and ratings.csv.'
        )
        setBusy(false)
        return
      }

      try {
        const batches = [watchlistItems, ratingItems, watchedItems]
        const resolved = await Promise.all(batches.map(resolveItems))
        const prefs = mergeItems(batches, resolved)
        const counts = [prefs.watchlist!.length, prefs.ratings!.length, prefs.watched!.length]
        const skipped = watchlistItems.length + ratingItems.length + watchedItems.length - counts.reduce((a, b) => a + b, 0)
        mergeSyncedPrefs(prefs)
        scheduleAlertsSync(getUserData())
        const parts = [`${counts[0]} watchlist`, `${counts[1]} ratings`, `${counts[2]} watched`]
        setNote(
          `Imported ${parts.join(' + ')}` +
            (skipped ? `: ${skipped} titles couldn't be matched` : '') +
            (skippedWatched ? `, ${skippedWatched} history rows unreadable` : '') +
            (ignored ? `, ${ignored} files ignored` : '') +
            '.'
        )
      } catch {
        setNote('Title matching failed: check your connection and try again.')
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <>
      <Text color='white' fontWeight='bold' fontSize='sm' mb={1}>Import your list</Text>
      <Flex gap={2} align='center' wrap='wrap'>
        <input
          ref={fileRef}
          type='file'
          accept='.csv,.zip,text/csv,application/zip'
          multiple
          hidden
          onChange={(e) => {
            importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Button size='xs' {...secondaryButton} disabled={busy} loading={busy} onClick={() => fileRef.current?.click()}>
          {source === 'tvtime' ? 'Pick your TV Time export' : 'Letterboxd or TV Time export'}
        </Button>
        <Text color='gray.400' fontSize='xs'>
          {source === 'tvtime'
            ? 'Your saved GDPR export ZIP works as-is, or pick the CSVs inside it.'
            : 'Letterboxd watchlist.csv/ratings.csv, or a TV Time GDPR export ZIP. Parsed on your device.'}
        </Text>
      </Flex>
      {note && <Text color='gray.300' fontSize='xs' mt={2}>{note}</Text>}
    </>
  )
}
