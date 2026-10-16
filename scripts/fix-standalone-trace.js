/**
 * Windows `next build` file tracing intermittently drops conditional-export
 * variants (e.g. @emotion's edge-light builds) from .next/standalone, which
 * then fails OpenNext's workerd-condition esbuild pass. Fills in any missing
 * files under the listed scopes; a no-op where tracing was complete.
 *
 * Usage: node scripts/fix-standalone-trace.js
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const scopes = ['@emotion', '@ark-ui']

let copied = 0
for (const scope of scopes) {
  const realScope = path.join(root, 'node_modules', scope)
  const tracedScope = path.join(root, '.next', 'standalone', 'node_modules', scope)
  if (!fs.existsSync(realScope) || !fs.existsSync(tracedScope)) continue
  for (const pkg of fs.readdirSync(tracedScope)) {
    const src = path.join(realScope, pkg)
    const dest = path.join(tracedScope, pkg)
    if (!fs.existsSync(src)) continue
    const before = countFiles(dest)
    fs.cpSync(src, dest, { recursive: true, force: false })
    copied += countFiles(dest) - before
  }
}

function countFiles(dir) {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1
  }
  return n
}

console.log(`fix-standalone-trace: filled ${copied} missing traced file(s)`)
