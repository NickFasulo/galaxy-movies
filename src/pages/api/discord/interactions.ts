import type { NextApiRequest, NextApiResponse } from 'next'
import { checkDistributedRateLimit } from '../../../lib/rateLimiter'
import {
  buildCommandResponse,
  isDeferred,
  verifyDiscordSignature,
  whereCommand,
  type DiscordInteraction
} from '../../../features/social/discordCommands'

// Ed25519 verification needs the exact bytes Discord signed.
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

  const publicKey = process.env.DISCORD_APP_PUBLIC_KEY
  const appId = process.env.DISCORD_APP_ID
  if (!publicKey || !appId) return res.status(503).end()

  const raw = (await readRawBody(req)).toString('utf8')
  const valid = await verifyDiscordSignature(
    raw,
    headerValue(req, 'x-signature-ed25519'),
    headerValue(req, 'x-signature-timestamp'),
    publicKey
  )
  if (!valid) return res.status(401).end()

  const interaction = JSON.parse(raw) as DiscordInteraction
  if (interaction.type === 1) return res.status(200).json({ type: 1 })
  if (interaction.type !== 2 || !interaction.data?.name) return res.status(400).end()

  // Rate-limit per guild (Discord edge IPs are shared); unsigned traffic has
  // already 401'd above so this only throttles verified commands.
  const subject = interaction.guild_id || interaction.channel_id || 'unknown'
  const allowed = await checkDistributedRateLimit(subject, {
    keyPrefix: 'discord_rl',
    maxRequests: 240,
    windowSeconds: 60 * 60
  })
  if (!allowed) return res.status(200).json({ type: 4, data: { content: 'Too many requests — try again later.', flags: 64 } })

  if (isDeferred(interaction.data.name)) {
    // Ack within 3s with a deferred response, then PATCH @original. Pages
    // Router has no ctx.waitUntil, so the followup is awaited before the
    // handler returns — the defer is already on the wire.
    res.status(200).json({ type: 5 })
    const payload = await whereCommand(interaction.data).catch(() => ({
      content: 'That lookup timed out — try again in a few seconds.',
      flags: 64
    }))
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch((err) => console.error('Discord followup failed:', err))
    return
  }

  const data = await buildCommandResponse(interaction)
  res.status(200).json({ type: 4, data })
}
