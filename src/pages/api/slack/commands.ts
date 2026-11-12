import type { NextApiRequest, NextApiResponse } from 'next'
import { checkDistributedRateLimit } from '../../../lib/rateLimiter'
import {
  buildCommandResponse,
  isDeferred,
  parseSlackPayload,
  verifySlackSignature,
  whereCommand
} from '../../../features/social/slackCommands'

// HMAC verification needs the exact bytes Slack signed.
export const config = {
  api: {
    bodyParser: false
  }
}

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function headerValue(req: NextApiRequest, name: string): string {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value) || ''
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return res.status(503).end()

  const raw = (await readRawBody(req)).toString('utf8')
  const valid = await verifySlackSignature(
    raw,
    headerValue(req, 'x-slack-signature'),
    headerValue(req, 'x-slack-request-timestamp'),
    secret
  )
  if (!valid) return res.status(401).end()

  const cmd = parseSlackPayload(raw)
  if (!cmd.command) return res.status(400).end()

  // Rate-limit per workspace (Slack egress IPs are shared); unverified traffic
  // has already 401'd above so this only throttles real commands.
  const allowed = await checkDistributedRateLimit(cmd.team_id || 'unknown', {
    keyPrefix: 'slack_rl',
    maxRequests: 240,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(200).json({ response_type: 'ephemeral', text: 'Too many requests — try again later.' })
  }

  if (isDeferred(cmd.command)) {
    // Slack needs an ack within 3s; TMDB lookups don't fit that budget. Ack
    // ephemeral, then POST the real answer to response_url (valid ~30 min,
    // no bot token needed). Awaited before return — Pages Router has no
    // ctx.waitUntil and the ack is already on the wire.
    res.status(200).json({ response_type: 'ephemeral', text: 'Looking that up…' })
    if (cmd.response_url) {
      const payload = await whereCommand(cmd.text).catch(() => ({
        response_type: 'ephemeral' as const,
        text: 'That lookup timed out — try again in a few seconds.'
      }))
      await fetch(cmd.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch((err) => console.error('Slack response_url failed:', err))
    }
    return
  }

  res.status(200).json(await buildCommandResponse(cmd))
}
