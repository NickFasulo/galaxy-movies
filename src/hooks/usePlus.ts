import { useEffect, useState } from 'react'
import { getAlertsCredentials, type AlertsCredentials } from '../utils/alertsSync'

export interface PlusFeatures {
  traktConnected: boolean
  shareId: string | null
  discordWebhook: string | null
  telegramConnected: boolean
}

export interface PlusState {
  loading: boolean
  creds: AlertsCredentials | null
  plus: boolean
  features: PlusFeatures | null
  refresh: () => void
}

// Entitlement check — the alerts credential is the account, so an unlinked
// device simply reports linked:false rather than a billing error.
export function usePlusStatus(): PlusState {
  const [state, setState] = useState<Omit<PlusState, 'refresh'>>({ loading: true, creds: null, plus: false, features: null })

  const load = () => {
    const creds = getAlertsCredentials()
    if (!creds) {
      setState({ loading: false, creds: null, plus: false, features: null })
      return
    }
    fetch(`/api/billing/status?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState({
        loading: false,
        creds,
        plus: d?.entitlement === 'plus',
        features: d?.entitlement === 'plus'
          ? { traktConnected: Boolean(d.traktConnected), shareId: d.shareId || null, discordWebhook: d.discordWebhook || null, telegramConnected: Boolean(d.telegramConnected) }
          : null
      }))
      .catch(() => setState({ loading: false, creds, plus: false, features: null }))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time localStorage read; a lazy initializer would mismatch SSR HTML
  useEffect(load, [])

  return { ...state, refresh: load }
}
