const { Redis } = require('@upstash/redis')

// Confirmed signups live in one hash, unconfirmed in another — email => token.
// The token gates both confirmation and unsubscribe links (shared secret in
// the link we send, so possession of the email = authorization).
const PENDING_KEY = 'gm:waitlist:pending'
const CONFIRMED_KEY = 'gm:waitlist:confirmed'

let redis
function getRedis() {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_KV_REST_API_URL || !process.env.UPSTASH_REDIS_KV_REST_API_TOKEN) {
    return null
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN,
  })
  return redis
}

module.exports = { getRedis, PENDING_KEY, CONFIRMED_KEY }
