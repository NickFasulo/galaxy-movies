import { useState } from 'react'
import { Badge, Box, Button, Flex, Input, Text } from '@chakra-ui/react'
import { fetchSyncedPrefs, type AlertsCredentials } from '../utils/alertsSync'
import { letterboxdCsvs } from '../utils/exportCsv'
import type { PlusFeatures } from '../hooks/usePlus'
import { SITE_URL } from '../utils/site'

const linkStyle = { textDecoration: 'underline', cursor: 'pointer' } as const

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function PlusTools({ creds, features, refresh, traktStatus }: {
  creds: AlertsCredentials
  features: PlusFeatures | null
  refresh: () => void
  traktStatus?: string
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [webhook, setWebhook] = useState(features?.discordWebhook ?? '')
  const [shareUrl, setShareUrl] = useState(
    features?.shareId ? `${SITE_URL}/list/${features.shareId}` : ''
  )

  const authed = { email: creds.email, key: creds.key }
  const post = async (url: string, body: Record<string, unknown> = {}) => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...authed, ...body })
    })
    const data = await resp.json().catch(() => ({}))
    return { ok: resp.ok, data }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setNote('')
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () => run(async () => {
    const prefs = await fetchSyncedPrefs(creds)
    if (!prefs) return
    download('galaxy-movies-data.json', JSON.stringify(prefs, null, 2), 'application/json')
  })

  const exportLetterboxd = (which: 'ratings' | 'watchlist') => run(async () => {
    const prefs = await fetchSyncedPrefs(creds)
    if (!prefs) return
    const csvs = letterboxdCsvs(prefs)
    download(`galaxy-${which}-letterboxd.csv`, csvs[which], 'text/csv')
  })

  const syncTrakt = () => run(async () => {
    const { ok, data } = await post('/api/trakt/sync')
    if (ok) {
      setNote(`Synced ${data.synced?.watchlist ?? 0} watchlist + ${data.synced?.ratings ?? 0} ratings to Trakt.`)
    } else if (data?.code === 'not_connected') {
      refresh()
    } else {
      setNote(data?.error || 'Trakt sync failed.')
    }
  })

  const disconnectTrakt = () => run(async () => {
    if ((await post('/api/trakt/disconnect')).ok) refresh()
  })

  const saveWebhook = () => run(async () => {
    const { ok, data } = await post('/api/alerts-prefs', { discordWebhook: webhook.trim() })
    setNote(ok ? 'Discord webhook saved.' : data?.error || 'Could not save webhook.')
    if (ok) refresh()
  })

  const connectTelegram = () => run(async () => {
    const { ok, data } = await post('/api/telegram/link')
    if (ok && data?.url) {
      window.open(data.url, '_blank', 'noopener')
      setNote('Telegram opened — press Start there to finish connecting.')
    } else {
      setNote(data?.error || 'Telegram is not available right now.')
    }
  })

  const disconnectTelegram = () => run(async () => {
    const resp = await fetch('/api/telegram/link', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authed)
    })
    if (resp.ok) refresh()
  })

  const enableShare = () => run(async () => {
    const { ok, data } = await post('/api/share-link')
    if (ok && data?.share) {
      setShareUrl(data.share)
      void navigator.clipboard?.writeText(data.share).catch(() => {})
      setNote('Share link copied.')
      refresh()
    }
  })

  const disableShare = () => run(async () => {
    const resp = await fetch('/api/share-link', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authed)
    })
    if (resp.ok) {
      setShareUrl('')
      refresh()
    }
  })

  const calendarUrl = `${SITE_URL}/api/calendar?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`

  return (
    <Box>
      <Flex align='center' gap={2} mb={1}>
        <Badge colorPalette='yellow'>Plus</Badge>
        <Text color='white' fontWeight='bold' fontSize='sm'>Galaxy Plus is active</Text>
      </Flex>
      <Text color='gray.400' fontSize='sm'>
        <a
          href={`/api/billing/portal?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`}
          style={linkStyle}
        >
          Manage subscription
        </a>
      </Text>

      <Text color='gray.500' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Export</Text>
      <Text color='gray.400' fontSize='sm'>
        <button type='button' disabled={busy} onClick={exportJson} style={linkStyle}>JSON</button>
        {' · '}
        <button type='button' disabled={busy} onClick={() => exportLetterboxd('watchlist')} style={linkStyle}>Letterboxd watchlist CSV</button>
        {' · '}
        <button type='button' disabled={busy} onClick={() => exportLetterboxd('ratings')} style={linkStyle}>Letterboxd ratings CSV</button>
      </Text>

      <Text color='gray.500' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Trakt</Text>
      {features?.traktConnected ? (
        <Text color='gray.400' fontSize='sm'>
          Connected.{' '}
          <button type='button' disabled={busy} onClick={syncTrakt} style={linkStyle}>Sync now</button>
          {' · '}
          <button type='button' disabled={busy} onClick={disconnectTrakt} style={linkStyle}>Disconnect</button>
        </Text>
      ) : (
        <Text color='gray.400' fontSize='sm'>
          {traktStatus === 'error' && <Text as='span' color='red.300'>Connection failed — try again. </Text>}
          <a href={`/api/trakt/connect?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`} style={linkStyle}>
            Connect Trakt
          </a>
          {' '}to push your list and ratings straight to your Trakt profile (shows included).
        </Text>
      )}
      {traktStatus === 'connected' && features?.traktConnected && (
        <Text color='green.300' fontSize='xs' mt={1}>Trakt connected — hit Sync now to push your list.</Text>
      )}

      <Text color='gray.500' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Calendar feed</Text>
      <Flex gap={2}>
        <Input
          readOnly
          value={calendarUrl}
          size='xs'
          fontSize={{ base: '16px', md: 'xs' }}
          bg='blackAlpha.400'
          borderColor='border.subtle'
          color='gray.300'
          onFocus={(e) => e.target.select()}
        />
        <Button size='xs' variant='outline' color='white' borderColor='border.subtle' _hover={{ bg: 'surface.overlay' }}
          onClick={() => void navigator.clipboard?.writeText(calendarUrl).catch(() => {})}>
          Copy
        </Button>
      </Flex>
      <Text color='gray.500' fontSize='xs' mt={1}>Paste it into Google/Apple Calendar — watchlist releases appear as all-day events.</Text>

      <Text color='gray.500' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Discord alerts</Text>
      <Flex gap={2}>
        <Input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder='https://discord.com/api/webhooks/…'
          size='xs'
          fontSize={{ base: '16px', md: 'xs' }}
          bg='blackAlpha.400'
          borderColor='border.subtle'
          color='white'
          _placeholder={{ color: 'gray.500' }}
        />
        <Button size='xs' colorPalette='yellow' loading={busy} onClick={saveWebhook} flexShrink={0}>
          {webhook.trim() ? 'Save' : 'Clear'}
        </Button>
      </Flex>
      <Text color='gray.500' fontSize='xs' mt={1}>
        Paste a Discord webhook URL (channel → Edit Channel → Integrations → Webhooks) and alerts post to that channel instead of email. Save an empty field to switch back to email.
      </Text>

      <Text color='gray.500' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Telegram alerts</Text>
      {features?.telegramConnected ? (
        <Text color='gray.400' fontSize='sm'>
          Connected — alerts arrive as Telegram DMs instead of email.{' '}
          <button type='button' disabled={busy} onClick={disconnectTelegram} style={linkStyle}>Disconnect</button>
        </Text>
      ) : (
        <Text color='gray.400' fontSize='sm'>
          <button type='button' disabled={busy} onClick={connectTelegram} style={linkStyle}>Connect Telegram</button>
          {' '}— alerts arrive as Telegram DMs instead of email.
        </Text>
      )}

      <Text color='gray.500' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Share your list</Text>
      {shareUrl ? (
        <Flex gap={2} align='center'>
          <Input
            readOnly
            value={shareUrl}
            size='xs'
            fontSize={{ base: '16px', md: 'xs' }}
            bg='blackAlpha.400'
            borderColor='border.subtle'
            color='gray.300'
            onFocus={(e) => e.target.select()}
          />
          <Button size='xs' variant='outline' color='white' borderColor='border.subtle' _hover={{ bg: 'surface.overlay' }}
            onClick={() => void navigator.clipboard?.writeText(shareUrl).catch(() => {})}>
            Copy
          </Button>
          <Button size='xs' variant='ghost' color='gray.400' _hover={{ color: 'red.300' }} disabled={busy} onClick={disableShare}>
            Disable
          </Button>
        </Flex>
      ) : (
        <Text color='gray.400' fontSize='sm'>
          <button type='button' disabled={busy} onClick={enableShare} style={linkStyle}>Create a public link</button>
          {' '}— a read-only page of your watchlist and ratings you can send to friends.
        </Text>
      )}

      {note && <Text color='gray.300' fontSize='xs' mt={3}>{note}</Text>}
    </Box>
  )
}
