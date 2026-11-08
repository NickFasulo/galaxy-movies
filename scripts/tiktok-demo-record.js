// Records a headed-browser walkthrough for the TikTok app-review demo video.
// Launches Chromium with Playwright's built-in video capture — every
// navigation inside that window (dev portal, OAuth consent, the ?code=
// redirect, the TikTok profile) lands in one .webm under shots/tiktok/demo/.
// Close the browser window to save; convert to mp4 with ffmpeg for the
// portal's 50MB mp4/mov requirement.
// Usage: node scripts/tiktok-demo-record.js [start-url]
const path = require('path')
const { chromium } = require('@playwright/test')

const START = process.argv[2] || 'https://www.galaxymovies.app'
const OUT = path.join(__dirname, '..', 'shots', 'tiktok', 'demo')

async function main() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const page = context.pages()[0] || (await context.newPage())
  console.log(`Recording -> ${OUT}\nClose the browser window when done.`)
  await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  await context.waitForEvent('close', { timeout: 0 })
  console.log('saved.')
}

main().catch((err) => { console.error(err); process.exit(1) })
