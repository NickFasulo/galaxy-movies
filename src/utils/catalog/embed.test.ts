import { describe, expect, it } from 'vitest'
import { buildEmbedUrl, embeddableProviders, isEmbeddableProvider, providerLabel } from './embed'

describe('embed utils', () => {
  it('accepts Watchmode-tracked providers', () => {
    expect(isEmbeddableProvider('netflix')).toBe(true)
    expect(isEmbeddableProvider('discovery-plus')).toBe(true)
  })

  it('rejects untracked and region-only providers', () => {
    expect(isEmbeddableProvider('jiohotstar')).toBe(false)
    expect(isEmbeddableProvider('bogus')).toBe(false)
    expect(isEmbeddableProvider('')).toBe(false)
  })

  it('strips the Movies suffix for labels', () => {
    expect(providerLabel('netflix')).toBe('Netflix')
    expect(providerLabel('amazon-prime-video')).toBe('Amazon Prime Video')
    expect(providerLabel('unknown')).toBe('unknown')
  })

  it('embeddableProviders lists the tracked set', () => {
    const keys = embeddableProviders().map((p) => p.key)
    expect(keys).toContain('netflix')
    expect(keys).toContain('hulu')
    expect(keys).not.toContain('jiohotstar')
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('buildEmbedUrl emits themed widget urls', () => {
    expect(buildEmbedUrl('netflix')).toMatch(/\/embed\/netflix$/)
    expect(buildEmbedUrl('hulu', 'light')).toMatch(/\/embed\/hulu\?theme=light$/)
    expect(buildEmbedUrl('hulu', 'dark')).toMatch(/\/embed\/hulu$/)
  })
})
