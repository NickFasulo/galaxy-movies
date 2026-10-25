import type { ResolvedMention } from './movieSearch'

export type ChatStreamEvent =
  | { type: 'content'; content: string; links?: ResolvedMention[] }
  | { type: 'done' }
  | { type: 'error' }
  | { type: 'unknown'; raw: string }

// A network chunk can split an SSE line anywhere — carry the partial tail
// between feeds so a one-shot event (like the links payload) isn't dropped
// on a boundary.
export function feedSseChunk(carry: string, chunk: string): { frames: string[]; carry: string } {
  const lines = (carry + chunk).split('\n')
  const rest = lines.pop() || ''
  const frames = lines.filter((line) => line.startsWith('data: ')).map((line) => line.slice(6))
  return { frames, carry: rest }
}

// Flush whatever the final chunk left incomplete after the reader closes.
export function flushSseCarry(carry: string): string[] {
  const tail = carry.trim()
  return tail.startsWith('data: ') ? [tail.slice(6)] : []
}

export function parseSseFrame(data: string): ChatStreamEvent {
  if (data === '[DONE]') return { type: 'done' }
  if (data === '[ERROR]') return { type: 'error' }
  try {
    const parsed = JSON.parse(data) as { content?: string; links?: ResolvedMention[] }
    const links = parsed.links?.length ? parsed.links : undefined
    if (!parsed.content && !links) return { type: 'unknown', raw: data }
    return { type: 'content', content: parsed.content || '', links }
  } catch {
    return { type: 'unknown', raw: data }
  }
}
