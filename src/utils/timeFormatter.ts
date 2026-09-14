export default function timeFormatter(totalMinutes?: number | null): string {
  if (!totalMinutes || totalMinutes <= 0) return 'N/A'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
}
