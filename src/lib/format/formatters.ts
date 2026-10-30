// UTC-pinned: callers pass 'YYYY-MM-DD' calendar dates (parsed as UTC
// midnight), so rendering in local time shows a day behind west of UTC and
// disagrees with workerd/UTC SSR output → hydration mismatch.
export function dateFormatter(date: string | number | Date): string {
  return new Date(date).toLocaleDateString('en-us', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

export function timeFormatter(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD'/'YYYYMMDD' → 'Jan 5'. Regex-only on purpose: Date('YYYY-MM-DD')
// is UTC midnight, which renders a day behind in local timezones.
export function shortDate(stamp: string | null | undefined, fallback = ''): string {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}` : fallback
}

export function removeUnderscores(str: string): string {
  const frags = str.split('_')
  for (let i = 0; i < frags.length; i++) {
    frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1)
  }
  return frags.join(' ')
}
