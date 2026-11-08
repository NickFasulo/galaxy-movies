import { LRUCache } from 'lru-cache'
import type { Video } from '../../types/tmdb'

const videoCache = new LRUCache<string, boolean>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24,
})

export async function getFirstPlayableVideo(videos: Video[] = []): Promise<Video | null> {
  if (!videos.length) return null

  const candidates = [
    videos.find((v) => v.type === 'Trailer' && v.official),
    videos.find((v) => v.type === 'Trailer'),
    videos.find((v) => v.type === 'Teaser'),
  ].filter((v): v is Video => Boolean(v?.key))

  const playable = await Promise.all(candidates.map(async (v) => {
    const key = v.key
    if (videoCache.has(key)) return videoCache.get(key)

    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${key}&format=json`,
        { method: 'HEAD' }
      )
      videoCache.set(key, res.ok)
      return res.ok
    } catch {
      videoCache.set(key, false)
      return false
    }
  }))

  const index = playable.findIndex(Boolean)
  return index === -1 ? null : candidates[index]
}