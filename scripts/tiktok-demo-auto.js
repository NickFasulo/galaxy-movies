// One-take TikTok review demo: drives OAuth login + authorize in a recorded
// headed browser (Playwright recordVideo -> shots/tiktok/demo/). Pauses for
// file signals written into shots/tiktok/demo/: sms-code.txt (the 6-digit
// login code) and proceed.txt (any content — continues after the upload).
// Usage: node scripts/tiktok-demo-auto.js <phone-number> [--prod]
const fs = require('fs')
const path = require('path')
const { chromium } = require('@playwright/test')

const env = {}
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const PROD = process.argv.includes('--prod')
const PHONE = process.argv.slice(2).find((a) => !a.startsWith('--'))
const CLIENT_KEY = env[PROD ? 'TIKTOK_CLIENT_KEY' : 'TIKTOK_SANDBOX_KEY']
if (!PHONE || !CLIENT_KEY) {
  console.error('Usage: node scripts/tiktok-demo-auto.js <phone-number> [--prod]')
  process.exit(1)
}

const auth = new URL('https://www.tiktok.com/v2/auth/authorize/')
auth.searchParams.set('client_key', CLIENT_KEY)
auth.searchParams.set('scope', 'video.publish')
auth.searchParams.set('response_type', 'code')
auth.searchParams.set('redirect_uri', 'https://www.galaxymovies.app/')
auth.searchParams.set('state', 'gm-tiktok')

const OUT = path.join(__dirname, '..', 'shots', 'tiktok', 'demo')
fs.mkdirSync(OUT, { recursive: true })
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (file, label) => {
  console.log(`waiting for ${label} (${file})`)
  for (;;) {
    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, 'utf8').trim()
      if (v) return v
    }
    await pause(1000)
  }
}

async function main() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const page = context.pages()[0] || (await context.newPage())
  console.log(`Recording -> ${OUT}`)

  await page.goto('https://www.galaxymovies.app', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await pause(3000)
  await page.goto(auth.toString(), { waitUntil: 'domcontentloaded' })
  await pause(2000)
  await page.click('text=Use phone / email / username')
  await pause(1500)
  await page.fill('input[name="mobile"]', PHONE)
  await page.click('text=Send code')
  const code = await waitFor(path.join(OUT, 'sms-code.txt'), 'SMS code')
  await page.fill('input[placeholder="Enter 6-digit code"]', code)
  await page.click('button:has-text("Log in")')
  await pause(5000)

  // Consent is skipped when the app was already authorized — handle both.
  if (!page.url().includes('code=')) {
    const authorize = page.locator('button:has-text("Authorize"), [role=button]:has-text("Authorize"), button:has-text("Allow")').first()
    if (await authorize.count()) await authorize.click()
    await pause(5000)
  }
  const codeMatch = page.url().match(/[?&]code=([^&]+)/)
  console.log(codeMatch ? `\nauth code: ${codeMatch[1]}` : `\nlanded on ${page.url()} — check it manually`)

  await waitFor(path.join(OUT, 'proceed.txt'), 'proceed signal (run the upload first)')
  await page.goto('https://www.galaxymovies.app', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await pause(2500)
  await page.goto('https://www.tiktok.com/@galaxymoviesapp', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await pause(3000)
  console.log('On the profile — open the private post, then close the window to save.')
  await context.waitForEvent('close', { timeout: 0 })
  console.log('saved.')
}

main().catch((err) => { console.error(err); process.exit(1) })
