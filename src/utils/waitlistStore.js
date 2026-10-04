const { getRedis } = require('./redis')

// Confirmed signups live in one hash, unconfirmed in another — email => token.
// The token gates both confirmation and unsubscribe links (shared secret in
// the link we send, so possession of the email = authorization).
const PENDING_KEY = 'gm:waitlist:pending'
const CONFIRMED_KEY = 'gm:waitlist:confirmed'

module.exports = { getRedis, PENDING_KEY, CONFIRMED_KEY }
