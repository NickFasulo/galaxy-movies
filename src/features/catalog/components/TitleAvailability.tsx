import { useState, type FormEvent } from 'react'
import { Box, Button, Flex, Input, Link, Text } from '@chakra-ui/react'
import { streamingProviders } from '../tmdb'
import { shortDate } from '../../../lib/format/formatters'
import type { MediaType } from '../../../types/tmdb'
import type { TitleChangeEvents } from '../streamingChanges'

const providerLabel = (key: string) => streamingProviders[key]?.title?.replace(/ Movies$/, '') || key

const dayLabel = (date: string) => shortDate(date, date)

interface Props {
  events: TitleChangeEvents | null
  tmdbId: number
  tmdbType: MediaType
  title: string
}

export default function TitleAvailability({ events, tmdbId, tmdbType, title }: Props) {
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

  return (
    <Box bg='blackAlpha.500' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='lg' p={4}>
      <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' mb={1}>
        Catalog changes
      </Text>
      {rows.map((row, i) => (
        <Text key={i} fontSize='sm' color='gray.300' mb={i === rows.length - 1 ? 3 : 1}>
          <Link href={row.href} color='gray.300' textDecoration='underline' _hover={{ color: 'white' }}>
            {row.text}
          </Link>
        </Text>
      ))}
      <TitleAlertForm tmdbId={tmdbId} tmdbType={tmdbType} title={title} hasEvents={rows.length > 0} />
    </Box>
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
        body: JSON.stringify({ email, tmdbId, tmdbType, title })
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
      {!hideDescription && <Text color='gray.400' fontSize='sm' mb={3}>
        {hasEvents
          ? 'Get an email when this title lands on or leaves a tracked service. No newsletter, just this title.'
          : 'Not streaming anywhere we track? Leave your email and we\u2019ll tell you the day it lands. No newsletter, just this title.'}
      </Text>}
      <Flex gap={2} direction='column' asChild><form onSubmit={submit}>
          <Input
            type='email'
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            size='sm'
            // iOS Safari auto-zooms inputs under 16px on focus
            fontSize={{ base: '16px', md: 'sm' }}
            bg='blackAlpha.400'
            borderColor='border.subtle'
            color='white'
            _placeholder={{ color: 'gray.500' }}
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
