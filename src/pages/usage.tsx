import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Flex, Input, Link, Text } from '@chakra-ui/react'
import { LuExternalLink, LuRefreshCw } from 'react-icons/lu'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import type { UsagePanel, UsageSeries } from '../lib/usageSources'

const TOKEN_KEY = 'gm.usage.token'
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const STATUS_BADGE: Record<UsagePanel['status'], { colorPalette: string; text: string }> = {
  ok: { colorPalette: 'green', text: 'live' },
  unconfigured: { colorPalette: 'gray', text: 'not configured' },
  error: { colorPalette: 'red', text: 'error' }
}

const TONE_COLOR = { warn: 'orange.300', bad: 'red.300' } as const
const SERIES_COLOR = { blue: 'var(--chakra-colors-blue-300)', yellow: 'var(--chakra-colors-yellow-300)' } as const

const fmtSeries = (v: number | undefined, format?: UsageSeries['format']) => {
  if (v == null) return ''
  switch (format) {
    case 'money':
      return `$${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`
    case 'pct':
      return `${v.toFixed(0)}%`
    case 'ms':
      return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`
    default:
      return v.toLocaleString('en-US')
  }
}

function Sparkline({ points, color }: { points: number[]; color?: UsageSeries['color'] }) {
  if (points.length < 2) return null
  const w = 100
  const h = 22
  const pad = 1.5
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1)
  const y = (p: number) => h - pad - ((p - min) / span) * (h - pad * 2)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const stroke = SERIES_COLOR[color || 'blue']
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio='none' style={{ width: '100%', height: '100%', display: 'block' }}>
      <polygon points={`${pad},${h - pad} ${line} ${x(points.length - 1).toFixed(1)},${h - pad}`} fill={stroke} opacity={0.15} />
      <polyline
        points={line}
        fill='none'
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect='non-scaling-stroke'
        strokeLinejoin='round'
        strokeLinecap='round'
      />
    </svg>
  )
}

function PanelCard({ panel }: { panel: UsagePanel }) {
  const badge = STATUS_BADGE[panel.status]
  return (
    <Box mb={4}>
      <Box
        bg='surface.raised'
        border='1px solid'
        borderColor='border.subtle'
        rounded='lg'
        p={4}
        minW={0}
      >
        <Flex justify='space-between' align='center' gap={2} mb={2}>
          <Text fontWeight='bold' truncate>{panel.name}</Text>
          <Flex align='center' gap={2} flexShrink={0}>
            {panel.link && (
              <Link href={panel.link} target='_blank' rel='noopener noreferrer' color='gray.500' fontSize='xs' _hover={{ color: 'white' }}>
                open <LuExternalLink style={{ display: 'inline', verticalAlign: '-2px' }} />
              </Link>
            )}
            <Badge colorPalette={badge.colorPalette}>{badge.text}</Badge>
          </Flex>
        </Flex>

        {panel.status === 'error' && <Text fontSize='sm' color='red.300'>{panel.error || 'request failed'}</Text>}
        {panel.status === 'unconfigured' && (
          <Text fontSize='sm' color='gray.400'>
            Add <Text as='span' fontFamily='mono' fontSize='xs'>{panel.needsEnv?.join(', ')}</Text> to .env.local, then run cf:secrets.
          </Text>
        )}

        {panel.metrics.map((m) => (
          <Flex key={m.label} justify='space-between' align='baseline' gap={3} py={1}>
            <Box minW={0}>
              <Text fontSize='sm' color='gray.400'>{m.label}</Text>
              {m.hint && <Text fontSize='xs' color='gray.500'>{m.hint}</Text>}
            </Box>
            <Text fontSize='sm' color={m.tone ? TONE_COLOR[m.tone] : 'white'} fontFamily='mono' flexShrink={0}>{m.value}</Text>
          </Flex>
        ))}

        {panel.series?.map((s) => (
          <Flex key={s.label} align='center' gap={3} py={1}>
            <Text fontSize='xs' color='gray.400' w='38%' flexShrink={0} truncate>{s.label}</Text>
            <Box flex={1} minW={0} h={6}>
              <Sparkline points={s.points} color={s.color} />
            </Box>
            <Text fontSize='xs' color='white' fontFamily='mono' w='4.5rem' textAlign='right' flexShrink={0}>
              {fmtSeries(s.points[s.points.length - 1], s.format)}
            </Text>
          </Flex>
        ))}

        {panel.links && (
          <Flex wrap='wrap' gap={2} mt={1}>
            {panel.links.map((l) => (
              <Link
                key={l.url}
                href={l.url}
                target='_blank'
                rel='noopener noreferrer'
                fontSize='xs'
                color='gray.400'
                px={2}
                py={1}
                border='1px solid'
                borderColor='border.subtle'
                rounded='md'
                _hover={{ color: 'white', bg: 'surface.overlay' }}
              >
                {l.label} <LuExternalLink style={{ display: 'inline', verticalAlign: '-2px' }} />
              </Link>
            ))}
          </Flex>
        )}
      </Box>
    </Box>
  )
}

export default function Usage() {
  const [token, setToken] = useState('')
  const [draft, setDraft] = useState('')
  const [panels, setPanels] = useState<UsagePanel[] | null>(null)
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const [fetchedAgo, setFetchedAgo] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (t: string) => {
    if (!t) return
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/usage', { headers: { Authorization: `Bearer ${t}` } })
      if (resp.status === 401) {
        setError('Invalid or missing token.')
        return
      }
      if (!resp.ok) {
        setError(`Request failed (${resp.status}).`)
        return
      }
      const body = await resp.json()
      setPanels(body.panels || [])
      setGeneratedAt(body.generatedAt || null)
      setFetchedAgo(Math.max(0, Math.round((Date.now() - (body.generatedAt || Date.now())) / 1000)))
    } catch {
      setError('Request failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  // The token arrives in the URL fragment — never sent to the server or into
  // access logs — and is kept in sessionStorage for refreshes on this device.
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
    const stored = sessionStorage.getItem(TOKEN_KEY)
    const t = fromHash || stored || ''
    if (fromHash && fromHash !== stored) sessionStorage.setItem(TOKEN_KEY, fromHash)
    if (!t) return
    const id = setTimeout(() => {
      setToken(t)
      void load(t)
    }, 0)
    return () => clearTimeout(id)
  }, [load])

  // 1px implicit rows + measured per-card row spans pack panels into a dense
  // masonry; ResizeObserver re-runs when metric content or column width shifts.
  const gridRef = useRef<HTMLDivElement>(null)
  useIsoLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const layout = () => {
      for (const el of Array.from(grid.children) as HTMLElement[]) {
        el.style.gridRowEnd = 'auto'
        const gap = parseFloat(getComputedStyle(el).marginBottom) || 0
        // The grid item itself is stretched to the 1px implicit row, so the
        // natural height comes from its inner card wrapper.
        const inner = (el.firstElementChild as HTMLElement | null) ?? el
        el.style.gridRowEnd = `span ${Math.ceil(inner.getBoundingClientRect().height + gap)}`
      }
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(grid)
    for (const el of Array.from(grid.children)) ro.observe(el)
    return () => ro.disconnect()
  }, [panels])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = draft.trim()
    if (!t) return
    sessionStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    void load(t)
  }

  return (
    <>
      <PageHead title='Usage' description='Internal usage dashboard' noindex hreflang={false} />
      <PageShell title='Usage' pb={12}>
        {!token || error ? (
          <Box maxW='26rem' mt={6} mx={{ base: 'auto', md: 0 }}>
            {error && <Text color='red.300' fontSize='sm' mb={3}>{error}</Text>}
            <Flex asChild gap={2}>
              <form onSubmit={submit}>
                <Input
                  type='password'
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder='USAGE_DASH_TOKEN'
                  size='sm'
                  bg='blackAlpha.400'
                  borderColor='border.subtle'
                  color='white'
                  _placeholder={{ color: 'gray.500' }}
                />
                <Button type='submit' size='sm' colorPalette='yellow' loading={loading} flexShrink={0}>
                  Load
                </Button>
              </form>
            </Flex>
          </Box>
        ) : (
          <>
            <Flex align='center' gap={3} mt={4} mb={4}>
              <Button
                size='xs'
                variant='outline'
                color='white'
                borderColor='border.subtle'
                _hover={{ bg: 'surface.overlay' }}
                loading={loading}
                onClick={() => void load(token)}
              >
                <LuRefreshCw /> Refresh
              </Button>
              <Button
                size='xs'
                variant='ghost'
                color='gray.500'
                _hover={{ color: 'white' }}
                onClick={() => {
                  sessionStorage.removeItem(TOKEN_KEY)
                  setToken('')
                  setDraft('')
                  setPanels(null)
                }}
              >
                Sign out
              </Button>
              {generatedAt && (
                <Text fontSize='xs' color='gray.500'>
                  fetched {fetchedAgo}s ago · cached 60s server-side
                </Text>
              )}
            </Flex>
            <Box
              ref={gridRef}
              css={{
                display: 'grid',
                gridTemplateColumns: { base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                columnGap: '1rem',
                gridAutoRows: '1px',
                gridAutoFlow: 'row dense'
              }}
            >
              {panels?.map((p) => <PanelCard key={p.name} panel={p} />)}
            </Box>
          </>
        )}
      </PageShell>
    </>
  )
}
