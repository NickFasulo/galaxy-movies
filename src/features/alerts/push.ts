import type { AlertsCredentials } from './alertsSync'

export type PushSupport =
  | 'unsupported'
  | 'ios-install' // iOS Safari delivers push only to installed PWAs (16.4+)
  | 'blocked' // user denied the permission prompt
  | 'ready'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY || ''

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !VAPID_PUBLIC_KEY) return 'unsupported'
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'blocked'
  return 'ready'
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

// VAPID keys are base64url; applicationServerKey wants bytes.
function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function subscribePush(creds: AlertsCredentials): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY)
    })
    const resp = await fetch('/api/alerts-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, key: creds.key, subscription: sub.toJSON() })
    })
    if (!resp.ok) {
      await sub.unsubscribe().catch(() => {})
      return false
    }
    return true
  } catch {
    return false
  }
}

export async function unsubscribePush(creds: AlertsCredentials): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return true
    await fetch('/api/alerts-push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, key: creds.key, endpoint: sub.endpoint })
    }).catch(() => {})
    await sub.unsubscribe()
    return true
  } catch {
    return false
  }
}
