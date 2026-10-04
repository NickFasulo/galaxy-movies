const { timingSafeEqual } = require('crypto')

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return safeEqual(req.headers.authorization || '', `Bearer ${secret}`)
}

module.exports = { safeEqual, isCronAuthorized }
