import { describe, expect, it } from 'vitest'
import { isIndexed, pendingSignature } from './indexCheck'

describe('isIndexed', () => {
  it.each([
    [{ verdict: 'PASS' }, true],
    [{ coverageState: 'Submitted and indexed' }, true],
    [{ coverageState: 'URL is unknown to Google' }, false],
    [{ verdict: 'FAIL', coverageState: 'Discovered - currently not indexed' }, false],
    [undefined, false]
  ])('maps %j to %s', (st, expected) => expect(isIndexed(st)).toBe(expected))
})

describe('pendingSignature', () => {
  it('is order-independent so an unchanged set dedupes', () => {
    const a = pendingSignature([{ url: 'b' }, { url: 'a' }])
    const b = pendingSignature([{ url: 'a' }, { url: 'b' }])
    expect(a).toBe(b)
  })

  it('changes when the pending set changes', () => {
    expect(pendingSignature([{ url: 'a' }])).not.toBe(pendingSignature([{ url: 'b' }]))
  })
})
