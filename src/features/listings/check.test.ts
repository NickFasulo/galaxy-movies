import { describe, expect, it } from 'vitest'
import { allListings, backlogListings, checkableListings, checkListing, unverifiableListings, type Listing } from './check'

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'x',
  name: 'X',
  category: 'directory',
  status: 'live',
  liveUrl: 'https://dir.example.com/galaxy-movies',
  ...over
})

const okResponse = (body = '<a href="https://www.galaxymovies.app">Galaxy Movies</a>') =>
  ({ ok: true, status: 200, text: async () => body }) as Response

describe('checkListing', () => {
  it('passes a 200 page that links back to the site', async () => {
    const r = await checkListing(listing(), async () => okResponse())
    expect(r.ok).toBe(true)
    expect(r.linksBack).toBe(true)
    expect(r.httpStatus).toBe(200)
  })

  it('fails a 200 page with no link back (listing removed or hijacked)', async () => {
    const r = await checkListing(listing(), async () => okResponse('<p>directory home</p>'))
    expect(r.ok).toBe(false)
    expect(r.linksBack).toBe(false)
  })

  it('fails on non-2xx with the status recorded', async () => {
    const r = await checkListing(listing(), async () => ({ ok: false, status: 404 }) as Response)
    expect(r.ok).toBe(false)
    expect(r.httpStatus).toBe(404)
  })

  it('marks 403/429 as WAF-blocked rather than a dead listing', async () => {
    const r = await checkListing(listing(), async () => ({ ok: false, status: 403 }) as Response)
    expect(r.ok).toBe(false)
    expect(r.blocked).toBe(true)
  })

  it('fails on fetch errors without throwing', async () => {
    const r = await checkListing(listing(), async () => {
      throw new Error('boom')
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  })
})

describe('registry partitions', () => {
  it('checks only live entries with a liveUrl', () => {
    const checkable = checkableListings()
    expect(checkable.length).toBeGreaterThan(0)
    expect(checkable.every((l) => l.status === 'live' && l.liveUrl)).toBe(true)
  })

  it('flags live entries missing a liveUrl as unverifiable', () => {
    const unverifiable = unverifiableListings()
    expect(unverifiable.length).toBeGreaterThan(0)
    expect(unverifiable.every((l) => l.status === 'live' && !l.liveUrl)).toBe(true)
  })

  it('keeps actionable states in the backlog', () => {
    const backlog = backlogListings()
    expect(backlog.length).toBeGreaterThan(0)
    expect(backlog.every((l) => l.status !== 'live' && l.status !== 'in-review')).toBe(true)
  })

  it('has unique ids across the registry', () => {
    const ids = allListings().map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
