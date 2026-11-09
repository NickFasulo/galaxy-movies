#!/usr/bin/env node
// Registers the Galaxy Movies slash commands on the Discord app.
// One-shot: re-run when commands change.
//
//   node scripts/discord-register.js            # global commands
//   node scripts/discord-register.js --guild X  # one guild (instant, for testing)
//
// Env (process env or .env.local): DISCORD_APP_ID, DISCORD_BOT_TOKEN.

const fs = require('fs')
const path = require('path')

const env = {}
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const envVar = (name) => process.env[name] || env[name]

const APP_ID = envVar('DISCORD_APP_ID')
const TOKEN = envVar('DISCORD_BOT_TOKEN')
if (!APP_ID || !TOKEN) {
  console.error('set DISCORD_APP_ID and DISCORD_BOT_TOKEN (env or .env.local)')
  process.exit(1)
}

const guildIdx = process.argv.indexOf('--guild')
const GUILD_ID = guildIdx > -1 ? process.argv[guildIdx + 1] : null

// Provider choices mirror embeddableProviders() — keep under Discord's
// 25-choice cap. Update if the tracked set changes.
const PROVIDER_CHOICES = [
  'netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max',
  'peacock', 'paramount-plus', 'tubi', 'pluto-tv', 'roku-channel', 'starz',
  'amc-plus', 'mgm-plus', 'crunchyroll', 'discovery-plus', 'plex', 'kanopy',
  'shudder', 'criterion'
].map((k) => ({ name: k, value: k }))

const COMMANDS = [
  {
    name: 'new',
    description: "What's new on streaming this week",
    type: 1,
    options: [
      { name: 'provider', description: 'Limit to one service', type: 3, required: false, choices: PROVIDER_CHOICES }
    ]
  },
  {
    name: 'leaving',
    description: "What's leaving a streaming service",
    type: 1,
    options: [
      { name: 'provider', description: 'Service key', type: 3, required: true, choices: PROVIDER_CHOICES }
    ]
  },
  {
    name: 'where',
    description: 'Where is a movie or show streaming?',
    type: 1,
    options: [
      { name: 'query', description: 'Title (e.g. "fight club" or "severance")', type: 3, required: true },
      { name: 'region', description: '2-letter region code (default US)', type: 3, required: false }
    ]
  },
  {
    name: 'calendar',
    description: 'Get the ICS calendar feed for a service',
    type: 1,
    options: [
      { name: 'provider', description: 'Service key', type: 3, required: true, choices: PROVIDER_CHOICES }
    ]
  }
]

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`

async function main() {
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${TOKEN}` },
    body: JSON.stringify(COMMANDS)
  })
  const body = await resp.json().catch(() => null)
  if (!resp.ok) {
    console.error(`registration failed ${resp.status}:`, JSON.stringify(body))
    process.exit(1)
  }
  const names = (body || []).map((c) => c.name).join(', ')
  console.log(`${GUILD_ID ? `guild ${GUILD_ID}` : 'global'} commands registered: ${names}`)
  if (!GUILD_ID) console.log('note: global commands take up to an hour to appear in clients')
}

main()
