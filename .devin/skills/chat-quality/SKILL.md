---
name: chat-quality
description: Review Galaxy Bot chat logs and feedback to iterate on the assistant's prompt — pull chat:log entries and thumbs-down excerpts, cluster failure modes, propose prompt edits with a version bump. Use when asked to review chat quality, improve the bot, or analyze chat feedback.
---

# Chat quality review

The Galaxy Bot (`/api/chat`, `src/features/ai/openai.ts`) leaves observability
crumbs specifically for this loop. This skill turns them into prompt
iterations.

## Signals

| Source | Where | What it gives |
|---|---|---|
| Exchange log | `chat:log` zset (`src/features/ai/chatLog.ts`) | `{ts, q, a, region, plus, turns, intents, grounded, titles, cached}` per exchange, 30d/2k cap. Question phrasing, intent mix, titles discussed |
| Thumbs votes | `chat_feedback:*` | votes + a 600-char excerpt of the rated reply — the failure-mode goldmine |
| Synced transcripts | `gm:alerts:chat` | Plus users' last ~30 turns (linked identities) |
| Session meta | `chat_session:*` | session-level context |
| Token/latency | `ai_usage` | cost + perf aggregates |
| OpenAI Logs | platform.openai.com/logs (30d) | full completions — `/api/chat` sends `store: true` + `metadata` (prompt version, region, plus flag) so every exchange is reviewable there |

The weekly indexing-report email already includes a chat-demand section
(top exact-phrase questions, intent mix) — start there for the summary view,
then drill into `chat_feedback` for what's broken.

## Review flow

1. Pull recent `chat:log` entries + all `chat_feedback` thumbs-down excerpts
   (Redis via the upstash MCP if configured, else direct REST with the
   `.env.local` creds — 1-2 commands, cheap).
2. Cluster the negative excerpts: wrong title resolved? refused a valid
   question? hallucinated availability? tone/format complaints? Plus vs free
   split (`plus` flag) — Plus gets 16 turns + 100/hr, free 10/hr.
3. Cross-reference OpenAI Logs by prompt version for the failing completions.
4. Propose prompt edits in `src/features/ai/openai.ts` (system prompt /
   `aiParams` for the `chat` task) — small, targeted changes tied to a
   cluster, not rewrites.
5. **Bump the prompt version** in the `metadata` sent with `store: true` so
   the next review can compare before/after in OpenAI Logs.

## Output

- A findings summary (clusters + counts + example excerpts) in the Galaxy
  Movies Drive folder — chat excerpts may contain user phrasing, keep them
  out of the repo.
- Proposed diff for review — prompt changes are product decisions; present
  them, don't land them unreviewed.

## Notes

- The `topQuestions` output doubles as keyword demand — hand repeated
  questions to `seed-research`, don't solve them here.
- Prompt caching never engages for chat (prefix under ~1k tokens) — don't
  restructure the prompt chasing it.
