import { useEffect, useState } from 'react'
import { getAlertsCredentials, type AlertsCredentials } from '../utils/alertsSync'

export interface PlusState {
  loading: boolean
  creds: AlertsCredentials | null
  plus: boolean
}

// Entitlement check — the alerts credential is the account, so an unlinked
// device simply reports linked:false rather than a billing error.
export function usePlusStatus(): PlusState {
  const [state, setState] = useState<PlusState>({ loading: true, creds: null, plus: false })

  useEffect(() => {
    const creds = getAlertsCredentials()
    if (!creds) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time localStorage read; a lazy initializer would mismatch SSR HTML
      setState({ loading: false, creds: null, plus: false })
      return
    }
    fetch(`/api/billing/status?email=${encodeURIComponent(creds.email)}&key=${encodeURIComponent(creds.key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState({ loading: false, creds, plus: d?.entitlement === 'plus' }))
      .catch(() => setState({ loading: false, creds, plus: false }))
  }, [])

  return state
}
