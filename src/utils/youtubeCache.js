import { LRUCache } from 'lru-cache'

const videoCache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24,
})

export async function getFirstPlayableKey(videos = []) {
  if (!videos.length) return null

  const candidates = [
    videos.find((v) => v.type === 'Trailer' && v.official)?.key,
    videos.find((v) => v.type === 'Trailer')?.key,
    videos.find((v) => v.type === 'Teaser')?.key,
  ].filter(Boolean)

  for (const key of candidates) {
    if (videoCache.has(key)) {
      if (videoCache.get(key)) return key
      continue
    }

    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${key}&format=json`,
        { method: 'HEAD' }
      )
      
      const isPlayable = res.ok
      videoCache.set(key, isPlayable)

      if (isPlayable) return key
    } catch {
      videoCache.set(key, false)
    }
  }

  return null
}