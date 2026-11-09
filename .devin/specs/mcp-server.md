# Spec: `galaxymovies-mcp` — MCP server for streaming data

An npm package giving Claude/Cursor/agents structured access to the public API. Ships as a stdio MCP server — `npx -y galaxymovies-mcp` — in a small separate repo. Zero hosting cost, free registry listings.

## Tools

| Tool | Params | Backing call |
|---|---|---|
| `list_providers` | — | static list mirroring `embeddableProviders()` (~20 keys + labels) |
| `get_streaming_changes` | `provider` (key or `all`) | `GET /api/streaming-changes?provider=` |
| `get_arrivals` | `provider`, `limit?` | same feed, returns `added` + `coming` only |
| `get_departures` | `provider`, `limit?` | same feed, returns `left` + `leavingSoon` only |
| `where_to_watch` | `query` (+ `year?`, `region?`, `type?`) | `GET /api/ext/where?title=…` (see where-api.md — build first) |
| `calendar_feed_url` | `provider` | returns `{SITE_URL}/api/cal/{provider}` URL string |
| `rss_feed_url` | `provider` | returns `{SITE_URL}/api/rss/{provider}` URL string (after rss spec lands) |

`get_streaming_changes`/`get_arrivals`/`get_departures` hit the keyless, CORS-open feed — no secrets anywhere in the package. `where_to_watch` hits `ext/where` (also keyless). Fetch errors → MCP error result with the API's error body; unknown provider key → list of valid keys in the error text (copy from the API's own 404 payload).

## Implementation

- Repo `galaxymovies-mcp`, files: `package.json`, `index.js` (ESM, Node ≥18 for fetch), `README.md`, `LICENSE` (MIT).
- Dep: `@modelcontextprotocol/sdk` — pin a version ≥7 days old per repo dep policy. No other deps; tool arg schemas via zod (comes with the SDK's peer expectations) or plain JSON schema — match whatever the SDK's current `McpServer`/`registerTool` API wants, don't hand-roll JSON-RPC.
- Server name `galaxymovies`, version from package.json. Each tool's description states the attribution requirement from `openapi.json` ("Powered by Galaxy Movies — keep attribution when republishing").
- Responses: `content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]` — structured + readable in every client; add `structuredContent` where the SDK supports it.
- Guard the fetch layer: 10s timeout (`AbortSignal.timeout`), one retry on 5xx, surface 429s as "rate limited, retry after N".

## Config snippet (README)

```json
{
  "mcpServers": {
    "galaxymovies": {
      "command": "npx",
      "args": ["-y", "galaxymovies-mcp"]
    }
  }
}
```

Same shape works for Claude Desktop, Cursor, Windsurf, and other stdio clients.

## Distribution

- `npm publish` — check name availability at publish time; fallback `@galaxymovies/mcp` (needs a free npm org).
- Submit to: the official MCP registry (`modelcontextprotocol/registry` PR), mcp.so, glama.ai — all free, all PR/submission-based.
- Cross-link: add the package + config snippet to `public/llms.txt` in the main repo so agents discover it from the site.

## Optional phase 2 — remote endpoint

`POST /api/mcp` in the main repo implementing Streamable HTTP transport with the same tool handlers calling `resolveWhere()`/`getProviderChanges()` in-process. Defer unless remote-MCP clients become a meaningful share; the npm package covers Claude Desktop/Cursor today.

## Verify

- `npx -y galaxymovies-mcp` locally; `claude mcp add` or inspector (`npx @modelcontextprotocol/inspector`) — list tools, call each once.
- `where_to_watch { query: "fight club" }` → providers; bad provider key → error with valid list.
- Package `files` whitelist keeps the tarball to index.js + docs.
