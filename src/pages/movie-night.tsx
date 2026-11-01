import { useState } from 'react'
import { Button, Flex, Spinner, Text } from '@chakra-ui/react'
import { secondaryButton } from '../theme'
import InfoPage, { InfoParagraph } from '../components/InfoPage'
import Panel from '../components/Panel'
import DarkInput from '../components/DarkInput'
import { getUserData } from '../lib/userData'
import { getAlertsCredentials } from '../features/alerts/alertsSync'
import { localTasteSide, mergeTaste, movieNightPrompt, parseShareInput, type MergedTaste, type TasteSide } from '../features/ai/tasteMerge'
import { feedSseChunk, flushSseCarry, parseSseFrame } from '../features/ai/chatStream'
import { renderMessageContent } from '../features/ai/chatRender'
import type { ResolvedMention } from '../features/ai/movieSearch'
import { streamingProviders } from '../features/catalog/tmdb'

type PersonState =
  | { mode: 'local' }
  | { mode: 'share'; input: string }

async function resolveSide(person: PersonState): Promise<TasteSide | { error: string }> {
  if (person.mode === 'local') return localTasteSide(getUserData())
  const shareId = parseShareInput(person.input)
  if (!shareId) return { error: 'That doesn’t look like a Galaxy Movies share link.' }
  try {
    const resp = await fetch(`/api/shared-taste?shareId=${encodeURIComponent(shareId)}`)
    if (resp.status === 404) return { error: 'Share link not found — it may have been revoked.' }
    if (!resp.ok) return { error: 'Couldn’t load that share link. Try again.' }
    const body = await resp.json()
    return body.taste as TasteSide
  } catch {
    return { error: 'Couldn’t load that share link. Try again.' }
  }
}

const providerLabel = (key: string) => streamingProviders[key]?.title?.replace(/ Movies$/, '') || key

export default function MovieNight() {
  const [personB, setPersonB] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [merged, setMerged] = useState<MergedTaste | null>(null)
  const [reply, setReply] = useState('')
  const [links, setLinks] = useState<ResolvedMention[] | undefined>()

  const run = async () => {
    setLoading(true)
    setError('')
    setReply('')
    setLinks(undefined)
    try {
      const [a, b] = await Promise.all([
        resolveSide({ mode: 'local' }),
        resolveSide({ mode: 'share', input: personB })
      ])
      if ('error' in a) { setError(a.error); return }
      if ('error' in b) { setError(b.error); return }

      const m = mergeTaste(a, b)
      setMerged(m)
      const { services } = getUserData()

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: movieNightPrompt(m) }],
          tasteProfile: { topRated: m.topRated, disliked: m.disliked, watchlist: m.watchlist, services: m.services },
          serviceKeys: m.serviceKeys,
          region: services.region,
          alerts: getAlertsCredentials()
        })
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        setError(body.error || 'The recommendation request failed — try again in a moment.')
        return
      }
      if (!resp.body) return

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const handleFrame = (data: string) => {
        const event = parseSseFrame(data)
        if (event.type !== 'content') return
        if (event.content) setReply((prev) => prev + event.content)
        if (event.links) setLinks(event.links)
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const { frames, carry } = feedSseChunk(buffer, decoder.decode(value, { stream: true }))
        buffer = carry
        frames.forEach(handleFrame)
      }
      flushSseCarry(buffer).forEach(handleFrame)
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <InfoPage
      title='Movie night for two'
      description='Merge two Galaxy Movies taste profiles and get picks you can both stream tonight.'
    >
      <InfoParagraph>
        One of you uses this device; the other sends over their share link (from their Plus page).
        We merge both ratings and watchlists, keep only the services you have in common, and ask
        Galaxy Bot for picks that bridge your tastes.
      </InfoParagraph>

      <Panel>
        <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' mb={2}>
          Person 1
        </Text>
        <Text color='gray.300' fontSize='sm'>This device — your saved ratings and watchlist.</Text>

        <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' mt={5} mb={2}>
          Person 2
        </Text>
        <DarkInput
          value={personB}
          onChange={(e) => setPersonB(e.target.value)}
          placeholder='Paste their share link (galaxymovies.app/list/…)'
          aria-label='Partner share link'
        />
        <Text color='gray.500' fontSize='2xs' mt={1}>
          They get the link from the share button on their Plus page — read-only, no sign-in needed.
        </Text>

        <Button
          mt={4}
          colorPalette='blue'
          size='sm'
          onClick={run}
          loading={loading}
          disabled={!personB.trim()}
        >
          Find something we&apos;ll both like
        </Button>
        {error && <Text color='red.300' fontSize='sm' mt={3}>{error}</Text>}
      </Panel>

      {merged && (
        <Panel>
          <Text color='gray.400' fontSize='xs' mb={2}>
            {merged.serviceKeys.length
              ? `Shared services: ${merged.serviceKeys.map(providerLabel).join(', ')}`
              : 'No shared services picked — recommendations fall back to either of yours.'}
            {merged.sharedLoved.length > 0 && ` · You both loved ${merged.sharedLoved.map((t) => t.replace(/\s*\(\d+(?:\.\d+)?\/10\)\s*$/, '')).join(', ')}`}
          </Text>
          {loading && !reply && <Spinner size='sm' color='blue.300' />}
          {reply && (
            <Text color='gray.100' fontSize='sm' lineHeight='1.7' whiteSpace='pre-line'>
              {renderMessageContent(reply, links)}
            </Text>
          )}
          {!loading && reply && (
            <Flex mt={3} gap={3} fontSize='xs'>
              <Button size='xs' {...secondaryButton} onClick={run}>
                Shuffle another pick
              </Button>
            </Flex>
          )}
        </Panel>
      )}
    </InfoPage>
  )
}
