import { useState, type FormEvent } from 'react'
import { Box, Button, Flex, Link, Text } from '@chakra-ui/react'
import DarkInput from '../../../components/DarkInput'
import Panel from '../../../components/Panel'
import { streamingProviders } from '../tmdb'
import { getUserData } from '../../../lib/userData'
import { shortDate } from '../../../lib/format/formatters'
import type { MediaType } from '../../../types/tmdb'
import type { TitleChangeEvents } from '../streamingChanges'
import type { TenureStint, TenureStats } from '../tenure'

const providerLabel = (key: string) => streamingProviders[key]?.title?.replace(/ Movies$/, '') || key

const dayLabel = (date: string) => shortDate(date, date)

const monthYear = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const stayLabel = (days: number) => days < 45 ? `~${Math.max(1, Math.round(days / 7))} wk` : `~${Math.round(days / 30)} mo`

const stintLine = (key: string, s: TenureStint): string => {
  const p = providerLabel(key)
  if (!s.left) {
    if (!s.on) return `On ${p} — predates our tracking`
    return s.cycles > 1 ? `Back on ${p} since ${monthYear(s.on)}` : `On ${p} since ${monthYear(s.on)}`
  }
  if (!s.on) return `Left ${p} ${monthYear(s.left)}`
  return `On ${p} ${monthYear(s.on)} – ${monthYear(s.left)}`
}

// Honest phrasing only — suppressed until the provider has enough completed
// stints for a median, and "past the usual" reads as observation, not warning.
const predictionLine = (key: string, s: TenureStint, stats: TenureStats | null | undefined): string | null => {
  if (s.left || !stats) return null
  const typical = `Typical ${providerLabel(key)} stay ${stayLabel(stats.medianDays)}`
  if (!s.on) return typical
  const ageDays = (Date.now() - Date.parse(`${s.on}T00:00:00Z`)) / 86400000
  return ageDays > stats.p75Days ? `${typical} — this title is already past it` : typical
}

interface Props {
  events: TitleChangeEvents | null
  tenure?: Record<string, TenureStint> | null
  tenureStats?: Record<string, TenureStats | null>
  tmdbId: number
  tmdbType: MediaType
  title: string
}

export default function TitleAvailability({ events, tenure, tenureStats, tmdbId, tmdbType, title }: Props) {
  const rows: { text: string; href: string }[] = []
  for (const e of events?.coming || []) {
    rows.push({ text: `Arrives on ${providerLabel(e.p)}${e.date ? `, ${dayLabel(e.date)}` : ''}`, href: `/leaving/${e.p}` })
  }
  for (const e of events?.leaving || []) {
    rows.push({ text: `Leaves ${providerLabel(e.p)}${e.date ? ` ${dayLabel(e.date)}` : ''}`, href: `/leaving/${e.p}` })
  }
  for (const e of events?.added || []) {
    rows.push({ text: `Added to ${providerLabel(e.p)}${e.date ? `, ${dayLabel(e.date)}` : ''}`, href: `/leaving/${e.p}` })
  }
  for (const e of events?.left || []) {
    rows.push({ text: `Left ${providerLabel(e.p)}${e.date ? `, ${dayLabel(e.date)}` : ''}`, href: `/leaving/${e.p}` })
  }

  // On-service stints first (newest arrival up top), departed after — the
  // "is it still there" question is why the block exists.
  const stints = Object.entries(tenure || {})
    .filter((e): e is [string, TenureStint] => Boolean(e[1]))
    .sort(([, a], [, b]) => {
      const aOn = a.left ? 0 : 1
      const bOn = b.left ? 0 : 1
      if (aOn !== bOn) return bOn - aOn
      return (b.left || b.on || '').localeCompare(a.left || a.on || '')
    })
    .slice(0, 8)
  const predictions = stints
    .map(([key, s]) => predictionLine(key, s, tenureStats?.[key]))
    .filter((line): line is string => Boolean(line))

  return (
    <Panel title='Catalog changes'>
      {rows.map((row, i) => (
        <Text key={i} fontSize='sm' color='gray.300' mb={i === rows.length - 1 ? 3 : 1}>
          <Link href={row.href} color='gray.300' textDecoration='underline' _hover={{ color: 'white' }}>
            {row.text}
          </Link>
        </Text>
      ))}
      {stints.length > 0 && (
        <Box mt={rows.length ? 3 : 0} pt={rows.length ? 3 : 0} borderTop={rows.length ? '1px solid var(--chakra-colors-border-subtle)' : undefined} mb={3}>
          <Text fontSize='2xs' color='gray.400' textTransform='uppercase' letterSpacing='0.08em' mb={1.5}>
            Streaming history
          </Text>
          {stints.map(([key, s], i) => (
            <Text key={i} fontSize='xs' color='gray.400' mb={0.5}>
              {stintLine(key, s)}
            </Text>
          ))}
          {predictions.map((line, i) => (
            <Text key={i} fontSize='xs' color='gray.500' fontStyle='italic' mt={1}>
              {line}
            </Text>
          ))}
        </Box>
      )}
      <TitleAlertForm tmdbId={tmdbId} tmdbType={tmdbType} title={title} hasEvents={rows.length > 0} />
    </Panel>
  )
}

// Rendered inside WatchProviders' empty state when a title streams nowhere —
// watch-intent searchers land on these pages and the signup is the conversion.
export function StreamingAlertCta({ tmdbId, tmdbType, title }: { tmdbId: number; tmdbType: MediaType; title: string }) {
  return (
    <Box>
      <Text color='gray.300' fontSize='xs' mb={1.5}>
        Get an email the day {title} lands on a tracked service. No newsletter, just this title.
      </Text>
      <TitleAlertForm tmdbId={tmdbId} tmdbType={tmdbType} title={title} hasEvents={false} hideDescription />
    </Box>
  )
}

export function TitleAlertForm({ tmdbId, tmdbType, title, hasEvents, hideDescription }: { tmdbId: number; tmdbType: MediaType; title: string; hasEvents: boolean; hideDescription?: boolean }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      const resp = await fetch('/api/alerts-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tmdbId, tmdbType, title, services: getUserData().services.providers })
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong')
      }
      setStatus('pending')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('idle')
    }
  }

  if (status === 'pending') {
    return (
      <Text color='green.300' fontSize='sm'>
        Check your inbox: we sent a link to confirm your alert for this title.
      </Text>
    )
  }

  return (
    <>
      {!hideDescription && <Text color='gray.300' fontSize='sm' mb={3}>
        {hasEvents
          ? 'Get an email when this title lands on or leaves a tracked service. No newsletter, just this title.'
          : 'Not streaming anywhere we track? Leave your email and we\u2019ll tell you the day it lands. No newsletter, just this title.'}
      </Text>}
      <Flex gap={2} direction='column' asChild><form onSubmit={submit}>
          <DarkInput
            type='email'
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            size='sm'
            _placeholder={{ color: 'gray.400' }}
          />
          <Button type='submit' size='sm' colorPalette='blue' loading={status === 'submitting'} flexShrink={0}
            data-umami-event='title-alert-submit' data-umami-event-title={title}>
            Notify me
          </Button>
        </form></Flex>
      {error && <Text color='red.300' fontSize='xs' mt={2}>{error}</Text>}
    </>
  )
}
