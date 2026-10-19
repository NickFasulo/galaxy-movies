import { describe, expect, it } from 'vitest'
import { matchGruvProduct } from './gruv'

const prod = (title: string, extra: { available?: boolean } = {}) => ({
  title,
  url: `/products/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}?_pos=1&_psq=x`,
  available: true,
  ...extra
})

describe('matchGruvProduct', () => {
  it('skips fuzzy mis-hits and picks the exact-title product', () => {
    const products = [
      prod('Jaws 3 - 4K Ultra HD + Blu-ray + Digital (4K Ultra HD + Blu-ray) [UHD]'),
      prod('Jaws 50th Anniversary Edition [UHD]'),
      prod('Jaws 3-Movie Collection - 4K Ultra HD + Blu-ray + Digital (4K Ultra HD + Blu-ray) [UHD]')
    ]
    const match = matchGruvProduct(products, { title: 'Jaws', year: 1975 })
    expect(match?.title).toBe('Jaws 50th Anniversary Edition [UHD]')
    expect(match?.url).toBe('https://gruv.com/products/jaws-50th-anniversary-edition-uhd-')
  })

  it('returns null when Gruv only stocks unrelated titles', () => {
    const products = [
      prod('Where The Toys Come From [DVD]'),
      prod('Doc McStuffins: Toy Hospital [DVD]'),
      prod('Ghost Story [Blu-ray]')
    ]
    expect(matchGruvProduct(products, { title: 'Toy Story', year: 1995 })).toBeNull()
  })

  it('rejects a different film with a similar name', () => {
    const products = [prod("Mario Puzo's The Godfather Coda: The Death of Michael Corleone [DVD]")]
    expect(matchGruvProduct(products, { title: 'The Godfather', year: 1972 })).toBeNull()
  })

  it('prefers the product whose paren year matches the release year', () => {
    const products = [
      prod('The Mummy (1999) (4K Ultra HD + Digital) [UHD]'),
      prod('The Mummy (2017) (4K Ultra HD + Digital) [UHD]'),
      prod('The Mummy (4K Ultra HD + Blu-ray) [UHD]'),
      prod('The Mummy (1932) [Blu-ray]'),
      prod('Abbott and Costello Meet the Mummy [Blu-ray]')
    ]
    expect(matchGruvProduct(products, { title: 'The Mummy', year: 1999 })?.title).toContain('(1999)')
    expect(matchGruvProduct(products, { title: 'The Mummy', year: 2017 })?.title).toContain('(2017)')
    expect(matchGruvProduct(products, { title: 'The Mummy', year: 1932 })?.title).toContain('(1932)')
  })

  it('distrusts year-less editions when tagged variants conflict with the film', () => {
    const products = [
      prod('The Mummy (1999) (4K Ultra HD + Digital) [UHD]'),
      prod('The Mummy (4K Ultra HD + Blu-ray) [UHD]'),
      prod('The Mummy (1932) [Blu-ray]')
    ]
    expect(matchGruvProduct(products, { title: 'The Mummy', year: 2025 })).toBeNull()
  })

  it('does not treat a year in the title itself as an edition year', () => {
    const products = [prod('1917 (4K Ultra HD + Blu-ray) [UHD]'), prod('Train to Busan [UHD]')]
    expect(matchGruvProduct(products, { title: '1917', year: 2019 })?.title).toBe('1917 (4K Ultra HD + Blu-ray) [UHD]')
  })

  it('matches format descriptors in parens and skips sold-out variants', () => {
    const products = [
      prod('Oppenheimer (with DVD) [Blu-ray]', { available: false }),
      prod('Oppenheimer (4K Ultra HD + Blu-ray) [UHD]')
    ]
    const match = matchGruvProduct(products, { title: 'Oppenheimer', year: 2023 })
    expect(match?.title).toBe('Oppenheimer (4K Ultra HD + Blu-ray) [UHD]')
  })

  it('still rejects sequels packaged as subtitles', () => {
    const products = [prod('The Fast and the Furious: Tokyo Drift (4K Ultra HD) [UHD]')]
    expect(matchGruvProduct(products, { title: 'The Fast and the Furious', year: 2001 })).toBeNull()
  })

  it('matches a movie sequel by its full subtitle', () => {
    const products = [
      prod('The Fast and the Furious [DVD]'),
      prod('The Fast and the Furious: Tokyo Drift (4K Ultra HD) [UHD]')
    ]
    expect(matchGruvProduct(products, { title: 'The Fast and the Furious: Tokyo Drift', year: 2006 })?.title).toContain('Tokyo Drift')
  })

  it('matches TV shows against complete-series style subtitles only', () => {
    const products = [
      prod('Doc McStuffins: Toy Hospital [DVD]'),
      prod('The Office: The Complete Series - Superfan Extended Episodes [Blu-ray]')
    ]
    expect(matchGruvProduct(products, { title: 'Doc McStuffins', mediaType: 'tv' })).toBeNull()
    expect(matchGruvProduct(products, { title: 'The Office', mediaType: 'tv' })?.title).toContain('Complete Series')
  })

  it('ignores release year for TV products (years tag the disc, not the show)', () => {
    const products = [prod('The Wire (2020) [DVD]')]
    expect(matchGruvProduct(products, { title: 'The Wire', year: 2002, mediaType: 'tv' })?.title).toBe('The Wire (2020) [DVD]')
    expect(matchGruvProduct(products, { title: 'The Wire', year: 2002, mediaType: 'movie' })).toBeNull()
  })
})
