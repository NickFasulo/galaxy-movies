export { getRedis } from './redis'

// Confirmed signups live in one hash, unconfirmed in another — email => token.
// The token gates both confirmation and unsubscribe links (shared secret in
// the link we send, so possession of the email = authorization).
export const PENDING_KEY = 'gm:waitlist:pending'
export const CONFIRMED_KEY = 'gm:waitlist:confirmed'
