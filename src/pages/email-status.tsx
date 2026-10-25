import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Box } from '@chakra-ui/react'
import InfoPage, { InfoParagraph } from '../components/InfoPage'
import PlusUpsell from '../features/billing/components/PlusUpsell'
import { firstParam } from '../lib/http'
import { fetchSyncedPrefs, setAlertsCredentials, syncAlertsNow } from '../features/alerts/alertsSync'
import { getUserData, mergeSyncedPrefs } from '../lib/userData'
import { trackEvent } from '../lib/umami'

const STATUSES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: "You're confirmed",
    body: "Thanks! We'll email you when something on your list lands on your streaming services."
  },
  'watch-confirmed': {
    title: 'Title alert confirmed',
    body: "Done. We'll email you when that title lands on or leaves a tracked streaming service. Want alerts for everything you care about? Save titles to your list and turn on full alerts."
  },
  unsubscribed: {
    title: 'Unsubscribed',
    body: "You've been removed from the alerts list. You won't hear from us again."
  },
  error: {
    title: 'Link invalid or expired',
    body: "This link didn't work. It may have already been used or expired. You can sign up again from your list page."
  }
}

export default function EmailStatus() {
  const { query } = useRouter()
  const status = STATUSES[firstParam(query.status) ?? ''] || STATUSES.error
  const [credsReady, setCredsReady] = useState(false)
  const statusKey = firstParam(query.status)
  const showUpsell = statusKey === 'confirmed' || statusKey === 'watch-confirmed'

  useEffect(() => {
    if (statusKey === 'confirmed') trackEvent('waitlist-confirmed')
    else if (statusKey === 'watch-confirmed') trackEvent('title-alert-confirmed')
  }, [statusKey])

  // Credentials travel in the URL fragment (never sent to the server on
  // redirect) rather than the query string, so they're read here client-side.
  useEffect(() => {
    if (firstParam(query.status) !== 'confirmed') return
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const email = params.get('email')
    const key = params.get('key')
    if (!email || !key) return

    setAlertsCredentials(email, key)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)

    // Pull the server snapshot first so a freshly-linked device merges the
    // existing profile instead of overwriting it with empty local state.
    const creds = { email, key }
    void (async () => {
      // Remount the upsell so its localStorage read sees the fresh creds.
      setCredsReady(true)
      const prefs = await fetchSyncedPrefs(creds)
      if (prefs) mergeSyncedPrefs(prefs)
      await syncAlertsNow(getUserData(), creds)
    })()
  }, [query.status])

  return (
    <>
      <InfoPage title={status.title} description={status.body} noindex withBackButton>
        <InfoParagraph>{status.body}</InfoParagraph>
        {showUpsell && (
          <Box mt={4} maxW='24rem'>
            <PlusUpsell key={String(credsReady)} />
          </Box>
        )}
      </InfoPage>
    </>
  )
}
