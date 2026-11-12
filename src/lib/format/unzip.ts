// Minimal ZIP reader for TV Time GDPR exports: central-directory walk, stored
// and deflated entries (raw deflate via DecompressionStream — no dependency).
// Caps guard against crafted archives hanging the tab on a 60MB+ inflate.
const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
const MAX_ENTRIES = 512
const MAX_ENTRY_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024

export interface ZipEntry {
  name: string
  data: Uint8Array
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

async function inflate(compressed: Uint8Array, size: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('Compressed archives are not supported in this browser')
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const buf = await new Response(stream).arrayBuffer()
  if (buf.byteLength > size) throw new ZipError('Archive entry is corrupt')
  return new Uint8Array(buf)
}

export async function unzipEntries(file: Uint8Array): Promise<ZipEntry[]> {
  try {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength)

    let eocd = -1
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 22 - 0xffff); i--) {
      if (view.getUint32(i, true) === EOCD_SIG) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new ZipError('Not a ZIP archive')

    const count = view.getUint16(eocd + 10, true)
    let offset = view.getUint32(eocd + 16, true)
    if (count > MAX_ENTRIES) throw new ZipError('Archive has too many files')

    const decoder = new TextDecoder()
    const entries: ZipEntry[] = []
    let totalSize = 0

    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== CENTRAL_SIG) throw new ZipError('Archive is corrupt')
      const method = view.getUint16(offset + 10, true)
      const compressedSize = view.getUint32(offset + 20, true)
      const size = view.getUint32(offset + 24, true)
      const nameLen = view.getUint16(offset + 28, true)
      const extraLen = view.getUint16(offset + 30, true)
      const commentLen = view.getUint16(offset + 32, true)
      const localOffset = view.getUint32(offset + 42, true)
      const name = decoder.decode(file.subarray(offset + 46, offset + 46 + nameLen))

      offset += 46 + nameLen + extraLen + commentLen
      if (name.endsWith('/')) continue
      if (size > MAX_ENTRY_BYTES || (totalSize += size) > MAX_TOTAL_BYTES) throw new ZipError('Archive is too large to import')
      if (view.getUint32(localOffset, true) !== LOCAL_SIG) throw new ZipError('Archive is corrupt')

      const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
      const compressed = file.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) entries.push({ name, data: new Uint8Array(compressed) })
      else if (method === 8) entries.push({ name, data: await inflate(compressed, size) })
    }
    return entries
  } catch (err) {
    if (err instanceof ZipError) throw err
    throw new ZipError('Could not read the archive')
  }
}
