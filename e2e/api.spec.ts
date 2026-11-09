import { test, expect } from './fixtures'

test.describe('public APIs', () => {
  test('ext/where resolves an IMDb id to providers', async ({ request }) => {
    const res = await request.get('/api/ext/where?imdb_id=tt0137523&region=US')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.tmdbId).toBe(550)
    expect(body.tmdbType).toBe('movie')
    expect(body.providers).toHaveProperty('flatrate')
    expect(body.attribution.text).toContain('Galaxy Movies')
    expect(res.headers()['access-control-allow-origin']).toBe('*')
  })

  test('ext/where rejects missing params with an example', async ({ request }) => {
    const res = await request.get('/api/ext/where')
    expect(res.status()).toBe(400)
    expect((await res.json()).example).toContain('/api/ext/where')
  })

  test('ext/where requires type with a bare TMDB id', async ({ request }) => {
    const res = await request.get('/api/ext/where?id=550')
    expect(res.status()).toBe(400)
  })

  test('rss feed serves a valid per-provider channel', async ({ request }) => {
    const res = await request.get('/api/rss/netflix')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/rss+xml')
    const xml = await res.text()
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('Galaxy Movies')
    expect(xml).toContain('<atom:link href=')
  })

  test('rss feed 404s unknown providers', async ({ request }) => {
    expect((await request.get('/api/rss/not-a-provider')).status()).toBe(404)
  })
})
