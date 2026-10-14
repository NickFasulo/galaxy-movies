export interface LetterboxdItem {
  title: string
  year?: string
  rating?: number
}

// Minimal RFC-4180 parser — Letterboxd exports quote fields containing
// commas and escape quotes as "".
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) pushRow()
  return rows
}

// Letterboxd watchlist.csv: Date,Name,Year,Letterboxd URI
//            ratings.csv: Date,Name,Year,Letterboxd URI,Rating (0.5–5 stars)
export function parseLetterboxdCsv(text: string): LetterboxdItem[] {
  const rows = parseCsv(text.replace(/^﻿/, '').trim())
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const nameCol = header.indexOf('name')
  const yearCol = header.indexOf('year')
  const ratingCol = header.indexOf('rating')
  if (nameCol < 0) return []

  const items: LetterboxdItem[] = []
  for (const r of rows.slice(1)) {
    const title = r[nameCol]?.trim()
    if (!title) continue
    const item: LetterboxdItem = { title }
    const year = yearCol >= 0 ? r[yearCol]?.trim() : undefined
    if (year && /^\d{4}$/.test(year)) item.year = year
    const stars = ratingCol >= 0 ? Number(r[ratingCol]) : NaN
    if (Number.isFinite(stars) && stars > 0) item.rating = Math.min(10, Math.max(1, Math.round(stars * 2)))
    items.push(item)
  }
  return items
}
