import { describe, expect, it } from 'vitest'
import {
  absoluteImageUrl,
  aggregateRatingSchema,
  buildOgImageUrl,
  itemListSchema,
  titleItem,
  titleListSchema
} from './schema'
import { SITE_URL } from './site'

describe('absoluteImageUrl', () => {
  it('passes through absolute URLs', () => {
    expect(absoluteImageUrl('https://img.example.com/a.jpg', 'https://site.example.com')).toBe('https://img.example.com/a.jpg')
  })

  it('prefixes the site URL whether or not the path has a leading slash', () => {
    expect(absoluteImageUrl('/a.jpg', 'https://site.example.com')).toBe('https://site.example.com/a.jpg')
    expect(absoluteImageUrl('a.jpg', 'https://site.example.com')).toBe('https://site.example.com/a.jpg')
  })
})

describe('aggregateRatingSchema', () => {
  it('returns undefined when there are no votes', () => {
    expect(aggregateRatingSchema(7.5, 0)).toBeUndefined()
    expect(aggregateRatingSchema(7.5, undefined)).toBeUndefined()
  })

  it('emits an AggregateRating when votes exist', () => {
    expect(aggregateRatingSchema(7.5, 100)).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 7.5,
      ratingCount: 100,
      bestRating: 10,
      worstRating: 0
    })
  })
})

describe('buildOgImageUrl', () => {
  it('encodes title and subtitle and includes the poster when present', () => {
    const url = buildOgImageUrl({
      siteUrl: 'https://site.example.com',
      title: 'A & B',
      subtitle: 'sub',
      posterPath: '/poster.jpg'
    })
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('A & B')
    expect(params.get('subtitle')).toBe('sub')
    expect(params.get('poster')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
  })

  it('omits the poster param when there is no poster', () => {
    const url = buildOgImageUrl({ siteUrl: 'https://site.example.com', title: 't', subtitle: 's', posterPath: null })
    expect(new URL(url).searchParams.get('poster')).toBeNull()
  })
})

describe('itemListSchema', () => {
  it('numbers positions from 1 and defaults numberOfItems to the item count', () => {
    const schema = itemListSchema({
      name: 'List',
      url: 'https://site.example.com/list',
      items: [{ name: 'a' }, { name: 'b' }]
    })
    expect(schema.numberOfItems).toBe(2)
    expect(schema.itemListElement.map((e) => e.position)).toEqual([1, 2])
  })

  it('honours an explicit numberOfItems', () => {
    const schema = itemListSchema({ name: 'L', url: 'u', items: [{ name: 'a' }], numberOfItems: 50 })
    expect(schema.numberOfItems).toBe(50)
  })
})

describe('titleItem', () => {
  it('builds a Movie entry with movie URL and datePublished', () => {
    const item = titleItem({ id: 1, title: 'Film', poster_path: '/p.jpg', release_date: '2024-03-01' })
    expect(item).toMatchObject({
      '@type': 'Movie',
      name: 'Film',
      url: `${SITE_URL}/movies/1`,
      image: 'https://image.tmdb.org/t/p/w500/p.jpg',
      datePublished: '2024-03-01'
    })
    expect(item).not.toHaveProperty('startDate')
  })

  it('builds a TVSeries entry with tv URL and startDate', () => {
    const item = titleItem({ id: 2, name: 'Show', mediaType: 'tv', first_air_date: '2020-01-01' })
    expect(item).toMatchObject({ '@type': 'TVSeries', url: `${SITE_URL}/tv/2`, startDate: '2020-01-01' })
  })

  it('lets the media argument override title.mediaType', () => {
    const item = titleItem({ id: 3, title: 'Film' }, 'tv')
    expect(item).toMatchObject({ '@type': 'TVSeries', url: `${SITE_URL}/tv/3` })
  })
})

describe('titleListSchema', () => {
  it('caps items at the limit while numberOfItems reports the full count', () => {
    const titles = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, title: `T${i + 1}` }))
    const schema = titleListSchema({ name: 'L', url: 'u', titles })
    expect(schema.itemListElement).toHaveLength(10)
    expect(schema.numberOfItems).toBe(15)
  })
})
