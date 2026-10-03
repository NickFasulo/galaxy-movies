import { useSyncExternalStore } from 'react'
import { EMPTY_USER_DATA, getUserData, getUserDataRaw, subscribeUserData } from '../utils/userData'

// Server snapshot is null → renders as EMPTY_USER_DATA during hydration, then
// re-reads localStorage after mount. Keeps SSR markup matching on first paint.
const getServerSnapshot = () => null

export function useUserData() {
  const raw = useSyncExternalStore(subscribeUserData, getUserDataRaw, getServerSnapshot)
  if (raw == null) return EMPTY_USER_DATA
  return getUserData()
}
