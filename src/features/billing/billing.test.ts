import { describe, expect, it } from 'vitest'
import { isPlusActive, parseBillingRecord } from './billing'

const now = Date.now()

describe('isPlusActive', () => {
  it('is entitled while active or trialing', () => {
    expect(isPlusActive({ status: 'active' }, now)).toBe(true)
    expect(isPlusActive({ status: 'trialing' }, now)).toBe(true)
  })

  it('keeps a canceled subscription until the paid period ends', () => {
    expect(isPlusActive({ status: 'canceled', currentPeriodEnd: now + 60_000 }, now)).toBe(true)
    expect(isPlusActive({ status: 'canceled', currentPeriodEnd: now - 60_000 }, now)).toBe(false)
    expect(isPlusActive({ status: 'canceled' }, now)).toBe(false)
  })

  it('keeps past_due subscribers entitled during dunning retries', () => {
    expect(isPlusActive({ status: 'past_due' }, now)).toBe(true)
  })

  it('is not entitled for inactive states or missing records', () => {
    expect(isPlusActive({ status: 'inactive' }, now)).toBe(false)
    expect(isPlusActive({ status: 'unpaid' }, now)).toBe(false)
    expect(isPlusActive(null, now)).toBe(false)
    expect(isPlusActive(undefined, now)).toBe(false)
  })
})

describe('parseBillingRecord', () => {
  it('accepts a stored record and rejects malformed values', () => {
    const record = { status: 'active', subscriptionId: 'sub_1' }
    expect(parseBillingRecord(record)).toBe(record)
    expect(parseBillingRecord(null)).toBeNull()
    expect(parseBillingRecord('active')).toBeNull()
    expect(parseBillingRecord({ subscriptionId: 'x' })).toBeNull()
  })
})
