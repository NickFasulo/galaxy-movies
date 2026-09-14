export default function dateFormatter(date?: string | null): string {
  if (!date) return 'N/A'

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return 'N/A'

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
