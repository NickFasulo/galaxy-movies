import { describe, expect, it } from 'vitest'
import { feedSseChunk, flushSseCarry, parseSseFrame } from './chatStream'

const contentFrame = (content: string) => `data: ${JSON.stringify({ content })}`

describe('feedSseChunk', () => {
  it('splits complete SSE lines and ignores non-data lines', () => {
    const { frames, carry } = feedSseChunk('', `data: {"content":"a"}\n\n: comment\ndata: {"content":"b"}\n`)
    expect(frames).toEqual(['{"content":"a"}', '{"content":"b"}'])
    expect(carry).toBe('')
  })

  it('holds an incomplete line as carry until the next chunk completes it', () => {
    const first = feedSseChunk('', 'data: {"content":"hel')
    expect(first.frames).toEqual([])
    expect(first.carry).toBe('data: {"content":"hel')

    const second = feedSseChunk(first.carry, 'lo"}\ndata: {"content":"x"}\n')
    expect(second.frames).toEqual(['{"content":"hello"}', '{"content":"x"}'])
    expect(second.carry).toBe('')
  })

  it('splits a frame that ends mid-line across three chunks', () => {
    let carry = ''
    const frames: string[] = []
    for (const chunk of ['data: {"content"', ':"one"}\nda', 'ta: {"content":"two"}\n']) {
      const next = feedSseChunk(carry, chunk)
      carry = next.carry
      frames.push(...next.frames)
    }
    expect(frames).toEqual(['{"content":"one"}', '{"content":"two"}'])
  })

  it('preserves an incomplete final frame for the tail flush', () => {
    const { carry } = feedSseChunk('', 'data: {"content":"a"}\ndata: {"content":"b')
    expect(carry).toBe('data: {"content":"b')
  })
})

describe('flushSseCarry', () => {
  it('recovers a trailing data line left in the buffer', () => {
    expect(flushSseCarry('data: {"content":"end"}')).toEqual(['{"content":"end"}'])
  })

  it('returns nothing for an empty or non-data tail', () => {
    expect(flushSseCarry('')).toEqual([])
    expect(flushSseCarry('  ')).toEqual([])
    expect(flushSseCarry(': heartbeat')).toEqual([])
  })
})

describe('parseSseFrame', () => {
  it('classifies the terminal markers', () => {
    expect(parseSseFrame('[DONE]')).toEqual({ type: 'done' })
    expect(parseSseFrame('[ERROR]')).toEqual({ type: 'error' })
  })

  it('extracts content frames', () => {
    expect(parseSseFrame('{"content":"hello"}')).toEqual({ type: 'content', content: 'hello', links: undefined })
  })

  it('extracts link metadata', () => {
    const links = [{ match: 'Dune', movieId: 438631, mediaType: 'movie', title: 'Dune' }]
    const event = parseSseFrame(JSON.stringify({ links }))
    expect(event).toEqual({ type: 'content', content: '', links })
  })

  it('carries content and links together when both arrive in one frame', () => {
    const links = [{ match: 'Dune', movieId: 438631, mediaType: 'movie', title: 'Dune' }]
    const event = parseSseFrame(JSON.stringify({ content: 'Try ', links }))
    expect(event).toMatchObject({ type: 'content', content: 'Try ', links })
  })

  it('drops an empty links array rather than emitting a links event', () => {
    expect(parseSseFrame('{"content":"x","links":[]}')).toEqual({ type: 'content', content: 'x', links: undefined })
  })

  it('returns unknown for malformed JSON and for JSON without content or links', () => {
    expect(parseSseFrame('{not json')).toEqual({ type: 'unknown', raw: '{not json' })
    expect(parseSseFrame('{"unrelated":true}')).toEqual({ type: 'unknown', raw: '{"unrelated":true}' })
    expect(parseSseFrame('42')).toEqual({ type: 'unknown', raw: '42' })
  })
})

describe('full stream assembly', () => {
  it('accumulates assistant text and captures the links event across chunk boundaries', () => {
    const stream = [
      contentFrame('Watch '),
      contentFrame('Dune'),
      `data: ${JSON.stringify({ links: [{ match: 'Dune', movieId: 438631, mediaType: 'movie', title: 'Dune' }] })}`,
      'data: [DONE]'
    ].join('\n')

    let carry = ''
    const events = []
    // Feed the stream in irregular 17-byte chunks to exercise boundaries.
    for (let i = 0; i < stream.length; i += 17) {
      const next = feedSseChunk(carry, stream.slice(i, i + 17))
      carry = next.carry
      for (const frame of next.frames) events.push(parseSseFrame(frame))
    }
    for (const frame of flushSseCarry(carry)) events.push(parseSseFrame(frame))

    const text = events
      .filter((e): e is { type: 'content'; content: string } => e.type === 'content')
      .map((e) => e.content)
      .join('')
    expect(text).toBe('Watch Dune')
    expect(events.at(-1)).toEqual({ type: 'done' })
    const linksEvent = events.find((e) => e.type === 'content' && 'links' in e && e.links)
    expect(linksEvent).toMatchObject({ links: [{ match: 'Dune', movieId: 438631 }] })
  })

  it('skips a malformed frame without losing the rest of the stream', () => {
    const stream = `${contentFrame('a')}\ndata: {bad json\n${contentFrame('b')}\ndata: [DONE]\n`
    let carry = ''
    const events = []
    const { frames, carry: rest } = feedSseChunk(carry, stream)
    carry = rest
    for (const frame of frames) events.push(parseSseFrame(frame))
    expect(events.map((e) => e.type)).toEqual(['content', 'unknown', 'content', 'done'])
  })
})
