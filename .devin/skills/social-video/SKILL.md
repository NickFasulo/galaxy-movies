---
name: social-video
description: Render the daily streaming-changes video and route it to TikTok, Instagram, YouTube, or email using the repo's scripts and their credential/mode requirements. Use when asked to render a TikTok/reel/short, post the daily video, or run the video pipeline manually.
---

# Social video ops

The daily diff video is normally a GH Actions job (`tiktok.yml`, 14:00 UTC —
workerd has no ffmpeg, so it renders in CI). This skill covers ad-hoc renders
and posting outside that job.

## Render

```bash
node scripts/generate-tiktok-video.js --api            # pulls public /api/streaming-changes feed
node scripts/generate-tiktok-video.js --api --no-audio # silent render
node scripts/generate-tiktok-video.js --api --bed assets/tiktok-bed.mp3
```

- `--api` reads the public feed — render needs only `TMDB_API_KEY` in env.
- Audio bed: `--bed` > `TIKTOK_AUDIO_BED` env > `assets/tiktok-bed.*` > a
  synthesized pad is generated. `--no-audio` skips entirely.
- Output lands in `shots/tiktok/` (untracked). Per the no-stray-files rule:
  after rendering, upload the MP4 to the **Galaxy Movies** Drive folder
  (`1DwEVcNj5O9Ob4QPsmCPkSrWw-nyXWjTm`, `create_drive_file` with
  `fileUrl: file://<repo>/shots/tiktok/<name>`) and delete the local copy.

## Post / deliver (pick one)

| Path | Script | Modes & creds |
|---|---|---|
| TikTok inbox draft | `scripts/tiktok-upload.js` | `TIKTOK_CLIENT_KEY`/`SECRET`/`REFRESH_TOKEN`; default/`draft` mode drops in the inbox for in-app finishing (needs `video.upload`) |
| TikTok direct post | `scripts/tiktok-upload.js` | `TIKTOK_POST_MODE=post` (needs `video.publish`; degrades to `SELF_ONLY` unaudited). `TIKTOK_PRIVACY` overrides. |
| Email MP4 | `scripts/tiktok-send.js` | `RESEND_API_KEY` + `TIKTOK_EMAIL_TO` (+optional `RESEND_FROM`) |
| Instagram | `scripts/ig-upload.js` | `ig-auth.js` mints creds |
| YouTube | `scripts/youtube-upload.js` | `youtube-auth.js` mints creds |
| Cross-post all | `make-social-post` MCP `t11077_post_to_socials` | fires the Make scenario |

- Re-auth: `node scripts/tiktok-auth.js` (scopes `video.upload,video.publish`;
  `--sandbox` for the review-demo app). The rotated refresh token persists
  back through `TIKTOK_GH_TOKEN` if set.
- The text-only broadcast path (Bluesky/Discord/Telegram/Mastodon/X/Reddit)
  is the `social-broadcast` cron in `src/features/social/socialChannels.ts`,
  not this skill — don't duplicate it.

## Guardrails

- Scripts hit real post APIs — confirm the target account/mode before
  running anything that publishes (`TIKTOK_POST_MODE=post` especially).
- `SHOTS`/render artifacts never stay in the repo and never get committed.
