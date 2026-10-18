import { PROVIDER_NAME_MATCH, streamingProviders } from './tmdb'
import { SITE_URL } from '../core/site'

// The embeddable set is exactly the US providers whose daily diffs come from
// Watchmode (PROVIDER_NAME_MATCH) — IN providers diff from TMDB snapshots and
// never carry "coming soon" data, so they're excluded.
export function isEmbeddableProvider(providerKey: string): boolean {
  return Boolean(PROVIDER_NAME_MATCH[providerKey] && streamingProviders[providerKey])
}

export function providerLabel(providerKey: string): string {
  return (streamingProviders[providerKey]?.title || providerKey).replace(/ Movies$/, '')
}

export function embeddableProviders(): { key: string; label: string }[] {
  return Object.keys(PROVIDER_NAME_MATCH)
    .filter(isEmbeddableProvider)
    .map((key) => ({ key, label: providerLabel(key) }))
}

export function buildEmbedUrl(providerKey: string, theme?: string): string {
  return `${SITE_URL}/embed/${providerKey}${theme === 'light' ? '?theme=light' : ''}`
}
