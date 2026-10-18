export function dateFormatter(date: string | number | Date): string {
  return new Date(date).toLocaleDateString('en-us', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function timeFormatter(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
}

export function removeUnderscores(str: string): string {
  const frags = str.split('_')
  for (let i = 0; i < frags.length; i++) {
    frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1)
  }
  return frags.join(' ')
}
