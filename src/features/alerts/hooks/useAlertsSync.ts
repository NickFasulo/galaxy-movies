import { useEffect } from 'react'
import { subscribeUserData, getUserData } from '../../../lib/userData'
import { scheduleAlertsSync } from '../alertsSync'

// Mounted once in _app so a watchlist/service edit on any page syncs to the
// server when this device has alerts credentials — no-ops otherwise.
export function useAlertsSync(): void {
  useEffect(() => {
    const sync = () => scheduleAlertsSync(getUserData())
    sync()
    return subscribeUserData(sync)
  }, [])
}
