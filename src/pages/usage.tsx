import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Flex, Input, Link, Text } from '@chakra-ui/react'
import { LuExternalLink, LuRefreshCw } from 'react-icons/lu'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import type { UsagePanel } from '../lib/usageSources'

const TOKEN_KEY = 'gm.usage.token'
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const STATUS_BADGE: Record<UsagePanel['status'], { colorPalette: string; text: string }> = {
  ok: { colorPalette: 'green', text: 'live' },
  unconfigured: { colorPalette: 'gray', text: 'not configured' },
  error: { colorPalette: 'red', text: 'error' }
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
            <Text fontSize='sm' color='white' fontFamily='mono' flexShrink={0}>{m.value}</Text>
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
              {generatedAt && (
                <Text fontSize='xs' color='gray.500'>
                  {new Date(generatedAt).toLocaleTimeString()} — cached 60s server-side
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
