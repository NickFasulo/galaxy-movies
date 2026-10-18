// The proxied tracker exposes window.umami; it's absent until the script loads
// (and under ad blockers), so every call must no-op cleanly.
declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number>) => void }
  }
}

export function trackEvent(event: string, data?: Record<string, string | number>) {
  if (typeof window === 'undefined') return
  window.umami?.track(event, data)
}
