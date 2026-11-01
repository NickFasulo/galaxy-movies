import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Box, Button, Flex, Link, Text } from '@chakra-ui/react'
import InfoPage, { InfoHeading, InfoParagraph } from '../components/InfoPage'
import Panel from '../components/Panel'
import ServicesPicker from '../features/alerts/components/ServicesPicker'
import { ALERTS_CREDS_EVENT, fetchSyncedPrefs, getAlertsCredentialsJson, setAlertsCredentials, type AlertsCredentials } from '../features/alerts/alertsSync'
import { mergeSyncedPrefs, type SyncedPrefs } from '../lib/userData'
import type { WatchEntry } from '../features/alerts/titleAlerts'
import type { PriceDropTarget } from '../features/alerts/priceDrops'
import { SITE_URL } from '../lib/site'

interface ManageResponse {
  prefs: SyncedPrefs | null
  watch: WatchEntry | null
  priceDrops: PriceDropTarget[]
  plus: boolean
  unsubUrl: string | null
}

function subscribeCreds(cb: () => void): () => void {
  window.addEventListener('storage', cb)
  window.addEventListener(ALERTS_CREDS_EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(ALERTS_CREDS_EVENT, cb)
  }
}

const noCreds = () => null

export default function AlertsManagePage() {
  const credsJson = useSyncExternalStore(subscribeCreds, getAlertsCredentialsJson, noCreds)
  const creds = useMemo<AlertsCredentials | null>(() => {
    if (!credsJson) return null
    try {
      return JSON.parse(credsJson) as AlertsCredentials
    } catch {
      return null
    }
  }, [credsJson])
  const [data, setData] = useState<ManageResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const loading = !!creds && !data && !failed

  // Credentials arrive in the URL fragment (manageLink in billing.ts) so the
  // synckey never crosses the wire as a query param; after capture it lives
  // in localStorage like every other device.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const email = params.get('email')
    const key = params.get('key')
    if (email && key) {
      setAlertsCredentials(email, key)
      window.history.replaceState(null, '', window.location.pathname)
      window.dispatchEvent(new Event(ALERTS_CREDS_EVENT))
    }
  }, [])

  useEffect(() => {
    if (!creds) return
    let dead = false
    const qs = `email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`
    void (async () => {
      try {
        const prefs = await fetchSyncedPrefs(creds)
        if (prefs) mergeSyncedPrefs(prefs)
        const resp = await fetch(`/api/alerts-manage?${qs}`)
        if (dead) return
        if (resp.ok) setData(await resp.json())
        else setFailed(true)
      } catch {
        if (!dead) setFailed(true)
      }
    })()
    return () => {
      dead = true
    }
  }, [creds])

  const removeWatch = async (t: { tmdbId: number; tmdbType: string }, action: string) => {
    if (!creds) return
    const id = `${action}:${t.tmdbType}:${t.tmdbId}`
    setRemoving(id)
    try {
      const resp = await fetch('/api/alerts-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, key: creds.key, action, tmdbId: t.tmdbId, tmdbType: t.tmdbType })
      })
      if (resp.ok) setData(await resp.json())
    } finally {
      setRemoving(null)
    }
  }

  const watchUnsub = data?.watch
    ? `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(creds?.email || '')}&token=${data.watch.unsub}`
    : null

  return (
    <InfoPage title='Manage your alerts' description='Your services, tracked titles, and subscription settings — no account needed.' noindex>
      {!creds && !loading && (
        <Panel>
          <Text color='gray.300' fontSize='sm'>
            This device has no alert credentials yet. Your manage link arrives in the
            confirmation email when you sign up for alerts — it looks like{' '}
            <Text as='span' color='gray.400'>/alerts#email=…&key=…</Text>.{' '}
            <Link href='/' color='blue.300'>Start tracking titles</Link> or sign up for the
            weekly digest to get yours.
          </Text>
        </Panel>
      )}

      {creds && (
        <>
          <InfoHeading>My streaming services</InfoHeading>
          <ServicesPicker />

          <InfoHeading>Titles I’m tracking</InfoHeading>
          <Panel>
            {loading && <Text color='gray.400' fontSize='sm'>Loading…</Text>}
            {!loading && !data?.watch?.titles.length && (
              <Text color='gray.400' fontSize='sm'>
                No single-title alerts yet. Hit “Alert me” on any movie or show page.
              </Text>
            )}
            {data?.watch?.titles.map((t) => {
              const id = `remove-watch:${t.tmdbType}:${t.tmdbId}`
              return (
                <Flex key={id} align='center' justify='space-between' py={1.5} borderBottomWidth='1px' borderColor='border.subtle' _last={{ borderBottom: 'none' }}>
                  <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} color='gray.100' fontSize='sm'>
                    {t.title}
                  </Link>
                  <Button
                    size='xs'
                    variant='outline'
                    colorPalette='red'
                    loading={removing === id}
                    onClick={() => removeWatch(t, 'remove-watch')}
                  >
                    Remove
                  </Button>
                </Flex>
              )
            })}
            {!!data?.watch?.services?.length && (
              <Text color='gray.500' fontSize='xs' mt={2}>
                Title alerts are filtered to {data.watch.services.length} selected service{data.watch.services.length === 1 ? '' : 's'}.
              </Text>
            )}
          </Panel>

          {data?.plus && (
            <>
              <InfoHeading>Price-drop alerts</InfoHeading>
              <Panel>
                {!data.priceDrops.length ? (
                  <Text color='gray.400' fontSize='sm'>
                    No price alerts yet — open a rental title and hit “Alert me if the price drops”.
                  </Text>
                ) : (
                  data.priceDrops.map((t) => {
                    const id = `remove-pricedrop:${t.tmdbType}:${t.tmdbId}`
                    return (
                      <Flex key={id} align='center' justify='space-between' py={1.5} borderBottomWidth='1px' borderColor='border.subtle' _last={{ borderBottom: 'none' }}>
                        <Box>
                          <Link href={`/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`} color='gray.100' fontSize='sm'>
                            {t.title}
                          </Link>
                          {t.minSeen != null && (
                            <Text color='gray.500' fontSize='2xs'>Lowest seen: ${t.minSeen.toFixed(2)}</Text>
                          )}
                        </Box>
                        <Button
                          size='xs'
                          variant='outline'
                          colorPalette='red'
                          loading={removing === id}
                          onClick={() => removeWatch(t, 'remove-pricedrop')}
                        >
                          Remove
                        </Button>
                      </Flex>
                    )
                  })
                )}
              </Panel>
            </>
          )}

          <InfoHeading>Calendar</InfoHeading>
          <Panel>
            <Text color='gray.300' fontSize='sm'>
              {data?.plus
                ? <>Your personal watchlist calendar is live at <Text as='span' color='gray.400'>/api/calendar</Text> — subscribe with your email and sync key.</>
                : <>Subscribe to any service’s public arrivals & departures calendar from its <Link href='/new-on-streaming' color='blue.300'>leaving page</Link>, or unlock your personal watchlist calendar with <Link href='/plus' color='blue.300'>Galaxy Plus</Link>.</>}
            </Text>
          </Panel>

          <InfoHeading>Unsubscribe</InfoHeading>
          <Panel>
            <Box>
              {data?.unsubUrl && (
                <>
                  <Button asChild size='xs' variant='outline' colorPalette='red' mb={2}>
                    <Link href={data.unsubUrl}>Unsubscribe from everything</Link>
                  </Button>
                  <Text color='gray.300' fontSize='sm' mb={2}>
                    Removes your digest subscription, tracked titles, and synced preferences.
                  </Text>
                </>
              )}
              {watchUnsub && !data?.unsubUrl && (
                <Button asChild size='xs' variant='outline' colorPalette='red' mb={2}>
                  <Link href={watchUnsub}>Stop all title alerts</Link>
                </Button>
              )}
              <InfoParagraph>
                Removing everything deletes your email, sync key, preferences, and notification
                history. Saving new titles or re-confirming starts fresh.
              </InfoParagraph>
            </Box>
          </Panel>
        </>
      )}
    </InfoPage>
  )
}
