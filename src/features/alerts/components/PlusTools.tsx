import { useState } from 'react'
import { Badge, Box, Button, Flex, Text } from '@chakra-ui/react'
import { secondaryButton } from '../../../theme'
import DarkInput from '../../../components/DarkInput'
import { fetchSyncedPrefs, type AlertsCredentials } from '../alertsSync'
import { letterboxdCsvs } from '../../../lib/format/exportCsv'
import { mergeSyncedPrefs } from '../../../lib/userData'
import type { PlusFeatures } from '../../billing/hooks/usePlus'
import { SITE_URL } from '../../../lib/site'

const actionBtn = {
  size: 'xs',
  ...secondaryButton
} as const

const dangerBtn = {
  size: 'xs',
  colorPalette: 'red',
  color: 'white'
} as const

const sectionTitle = { color: 'gray.300', fontSize: 'xs', mt: 4, mb: 2, fontWeight: 'bold' } as const

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
  const [webhookSaving, setWebhookSaving] = useState(false)
  type NoteKey = 'trakt' | 'discord' | 'telegram' | 'share'
  const [notes, setNotes] = useState<Partial<Record<NoteKey, string>>>({})
  const setNote = (key: NoteKey, msg: string) => setNotes((n) => ({ ...n, [key]: msg }))
  const [webhook, setWebhook] = useState(features?.discordWebhook ?? '')
  const [shareUrl, setShareUrl] = useState(
    features?.shareId ? `${SITE_URL}/list/${features.shareId}` : ''
  )

  const authed = { email: creds.email, key: creds.key }
  // The abort timeout matters: a hung fetch leaves busy=true forever and
  // dead-disables every tool button until the tab reloads.
  const post = async (url: string, body: Record<string, unknown> = {}) => {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...authed, ...body }),
        signal: AbortSignal.timeout(30_000)
      })
      const data = await resp.json().catch(() => ({}))
      return { ok: resp.ok, data }
    } catch {
      return { ok: false, data: {} }
    }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setNotes({})
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
      setNote('trakt', `Synced ${data.synced?.watchlist ?? 0} watchlist + ${data.synced?.ratings ?? 0} ratings to Trakt.`)
    } else if (data?.code === 'not_connected') {
      refresh()
    } else {
      setNote('trakt', data?.error || 'Trakt sync failed.')
    }
  })

  // Server merges Trakt items into stored prefs; re-fetch + local merge so
  // this device picks them up (local entries still win conflicts).
  const importTrakt = () => run(async () => {
    const { ok, data } = await post('/api/trakt/import')
    if (ok) {
      const prefs = await fetchSyncedPrefs(creds)
      if (prefs) mergeSyncedPrefs(prefs)
      setNote('trakt', `Imported ${data.imported?.watchlist ?? 0} watchlist + ${data.imported?.ratings ?? 0} ratings from Trakt.`)
    } else if (data?.code === 'not_connected') {
      refresh()
    } else {
      setNote('trakt', data?.error || 'Trakt import failed.')
    }
  })

  const disconnectTrakt = () => run(async () => {
    if ((await post('/api/trakt/disconnect')).ok) refresh()
  })

  const saveWebhook = () => run(async () => {
    setWebhookSaving(true)
    try {
      const { ok, data } = await post('/api/alerts-prefs', { discordWebhook: webhook.trim() })
      setNote('discord', ok ? 'Discord webhook saved.' : data?.error || 'Could not save webhook.')
      if (ok) refresh()
    } finally {
      setWebhookSaving(false)
    }
  })

  const connectTelegram = () => run(async () => {
    const { ok, data } = await post('/api/telegram/link')
    if (ok && data?.url) {
      window.open(data.url, '_blank', 'noopener')
      setNote('telegram', 'Telegram opened: press Start there to finish connecting.')
    } else {
      setNote('telegram', data?.error || 'Telegram is not available right now.')
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
      setNote('share', 'Share link copied.')
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
      <Flex align='center' gap={2} mb={2}>
        <Badge colorPalette='yellow'>Plus</Badge>
        <Text color='white' fontWeight='bold' fontSize='sm'>Galaxy Plus is active</Text>
      </Flex>
      {features?.manageable && (
        <Button asChild {...actionBtn}>
          <a href={`/api/billing/portal?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`}>
            Manage subscription
          </a>
        </Button>
      )}

      <Text {...sectionTitle}>Export</Text>
      <Flex gap={2} wrap='wrap'>
        <Button {...actionBtn} disabled={busy} onClick={exportJson}>JSON</Button>
        <Button {...actionBtn} disabled={busy} onClick={() => exportLetterboxd('watchlist')}>Letterboxd watchlist CSV</Button>
        <Button {...actionBtn} disabled={busy} onClick={() => exportLetterboxd('ratings')}>Letterboxd ratings CSV</Button>
      </Flex>

      <Flex align='center' gap={2} {...sectionTitle}>
        <Text>Trakt</Text>
        {features?.traktConnected && <Badge colorPalette='green'>Connected</Badge>}
        {traktStatus === 'connected' && features?.traktConnected && (
          <Text color='green.300' fontWeight='normal'>Hit Sync now to push your list.</Text>
        )}
      </Flex>
      {features?.traktConnected ? (
        <Flex align='center' gap={2} wrap='wrap'>
          <Button {...actionBtn} disabled={busy} onClick={syncTrakt}>Sync now</Button>
          <Button {...actionBtn} disabled={busy} onClick={importTrakt}>Import from Trakt</Button>
          <Button {...dangerBtn} disabled={busy} onClick={disconnectTrakt}>Disconnect</Button>
        </Flex>
      ) : (
        <Flex align='center' gap={2} wrap='wrap'>
          {traktStatus === 'error' && <Text color='red.300' fontSize='xs'>Connection failed: try again.</Text>}
          <Button asChild {...actionBtn}>
            <a href={`/api/trakt/connect?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`}>
              Connect Trakt
            </a>
          </Button>
          <Text color='gray.400' fontSize='xs'>push your list and ratings to your Trakt profile (shows included).</Text>
        </Flex>
      )}
      {notes.trakt && <Text color='gray.300' fontSize='xs' mt={2}>{notes.trakt}</Text>}
      <Text {...sectionTitle}>Calendar feed</Text>
      <Flex gap={2} align='center' wrap='wrap'>
        <DarkInput
          readOnly
          value={calendarUrl}
          size='xs'
          fontSize={{ base: '16px', md: 'xs' }}
          color='gray.300'
          onFocus={(e) => e.target.select()}
        />
        <Button {...actionBtn} onClick={() => void navigator.clipboard?.writeText(calendarUrl).catch(() => {})}>
          Copy
        </Button>
        <Button asChild {...actionBtn}>
          <a href={calendarUrl.replace(/^https?:/, 'webcal:')}>Subscribe</a>
        </Button>
        <Button asChild {...actionBtn}>
          <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarUrl)}`} target='_blank' rel='noopener'>
            Google Calendar
          </a>
        </Button>
      </Flex>
      <Text color='gray.300' fontSize='xs' mt={1}>Subscribe opens your calendar app; watchlist releases appear as all-day events.</Text>

      <Text {...sectionTitle}>Discord alerts</Text>
      <Flex gap={2}>
        <DarkInput
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder='https://discord.com/api/webhooks/…'
          size='xs'
          fontSize={{ base: '16px', md: 'xs' }}
          _placeholder={{ color: 'gray.500' }}
        />
        <Button size='xs' colorPalette='yellow' loading={webhookSaving} onClick={saveWebhook} flexShrink={0}>
          {webhook.trim() ? 'Save' : 'Clear'}
        </Button>
      </Flex>
      {notes.discord && <Text color='gray.300' fontSize='xs' mt={2}>{notes.discord}</Text>}
      <Text color='gray.300' fontSize='xs' mt={1}>
        Paste a Discord webhook URL (channel → Edit Channel → Integrations → Webhooks) and alerts post to that channel instead of email. Save an empty field to switch back to email.
      </Text>

      <Flex align='center' gap={2} {...sectionTitle}>
        <Text>Telegram alerts</Text>
        {features?.telegramConnected && <Badge colorPalette='green'>Connected</Badge>}
      </Flex>
      {features?.telegramConnected ? (
        <Flex align='center' gap={2} wrap='wrap'>
          <Text color='gray.400' fontSize='xs'>alerts arrive as Telegram DMs instead of email.</Text>
          <Button {...dangerBtn} disabled={busy} onClick={disconnectTelegram}>Disconnect</Button>
        </Flex>
      ) : (
        <Flex align='center' gap={2} wrap='wrap'>
          <Button {...actionBtn} disabled={busy} onClick={connectTelegram}>Connect Telegram</Button>
          <Text color='gray.400' fontSize='xs'>alerts arrive as Telegram DMs instead of email.</Text>
        </Flex>
      )}
      {notes.telegram && <Text color='gray.300' fontSize='xs' mt={2}>{notes.telegram}</Text>}

      <Text {...sectionTitle}>Share your list</Text>
      {shareUrl ? (
        <Flex gap={2} align='center'>
          <DarkInput
            readOnly
            value={shareUrl}
            size='xs'
            fontSize={{ base: '16px', md: 'xs' }}
            color='gray.300'
            onFocus={(e) => e.target.select()}
          />
          <Button {...actionBtn} onClick={() => void navigator.clipboard?.writeText(shareUrl).catch(() => {})}>
            Copy
          </Button>
          <Button {...dangerBtn} disabled={busy} onClick={disableShare}>
            Disable
          </Button>
        </Flex>
      ) : (
        <Flex align='center' gap={2} wrap='wrap'>
          <Button {...actionBtn} disabled={busy} onClick={enableShare}>Create a public link</Button>
          <Text color='gray.400' fontSize='xs'>a read-only page of your watchlist and ratings you can send to friends.</Text>
        </Flex>
      )}
      {notes.share && <Text color='gray.300' fontSize='xs' mt={2}>{notes.share}</Text>}
    </Box>
  )
}
