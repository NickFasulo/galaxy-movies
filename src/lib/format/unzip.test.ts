import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { unzipEntries, ZipError } from './unzip'

function buildZip(files: { name: string; data: Uint8Array; method?: 0 | 8 }[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const method = file.method ?? 0
    const stored = method === 8 ? new Uint8Array(deflateRawSync(file.data)) : file.data

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, method, true)
    local.setUint32(18, stored.length, true)
    local.setUint32(22, file.data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, stored)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(10, method, true)
    central.setUint32(20, stored.length, true)
    central.setUint32(24, file.data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, offset, true)
    centrals.push(new Uint8Array(central.buffer), name)

    offset += 30 + name.length + stored.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + 22)
  let pos = 0
  for (const part of [...parts, ...centrals, new Uint8Array(eocd.buffer)]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

const csv = (name: string, content = 'a,b\n1,2\n') => ({ name, data: new TextEncoder().encode(content) })

describe('unzipEntries', () => {
  it('reads stored entries', async () => {
    const zip = buildZip([csv('followed_tv_show.csv'), csv('nested/ratings-live-votes.csv', 'x,y\n')])
    const entries = await unzipEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['followed_tv_show.csv', 'nested/ratings-live-votes.csv'])
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('a,b\n1,2\n')
  })

  it.runIf(typeof DecompressionStream !== 'undefined')('inflates deflated entries', async () => {
    const content = 'col\n' + 'value\n'.repeat(5000)
    const zip = buildZip([{ name: 'tracking-prod-records.csv', data: new TextEncoder().encode(content), method: 8 }])
    const entries = await unzipEntries(zip)
    expect(new TextDecoder().decode(entries[0]!.data)).toBe(content)
  })

  it('skips directory entries', async () => {
    const zip = buildZip([{ name: 'export/', data: new Uint8Array() }, csv('followed_tv_show.csv')])
    const entries = await unzipEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['followed_tv_show.csv'])
  })

  it('rejects non-zip input', async () => {
    await expect(unzipEntries(new TextEncoder().encode('not a zip'))).rejects.toThrow(ZipError)
  })

  it('rejects a declared entry size over the cap', async () => {
    const big = { name: 'big.csv', data: new Uint8Array(8) }
    const zip = buildZip([big])
    const view = new DataView(zip.buffer)
    // Patch the local + central uncompressed-size fields past the 32MB cap.
    view.setUint32(22, 40 * 1024 * 1024, true)
    const eocdAt = zip.length - 22
    const centralAt = view.getUint32(eocdAt + 16, true)
    view.setUint32(centralAt + 24, 40 * 1024 * 1024, true)
    await expect(unzipEntries(zip)).rejects.toThrow('too large')
  })
})
