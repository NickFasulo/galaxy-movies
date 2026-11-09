---
description: "Don't add non-code files to the repo; drafts and screenshots go to Google Drive"
trigger: always_on
---

Do not add files to the repository that aren't part of the codebase's functionality — screenshots, Reddit/post drafts, marketing copy, captured artifacts, temp outputs, or notes files.

Generated artifacts default to the user's Google Drive **Galaxy Movies** folder (folder id `1DwEVcNj5O9Ob4QPsmCPkSrWw-nyXWjTm`), not the repo — this applies without being asked each time. Workflow: render locally into `shots/` (untracked), upload via google-workspace `create_drive_file` with `fileUrl: file:///<absolute path to repo>/shots/<name>` (the MCP's `ALLOWED_FILE_DIRS` is set to `shots/` via `~/.config/devin/mcp_config.json` — not the repo root, keep it that way), then delete the local copy once the upload succeeds. If `fileUrl` uploads fail (localhost URLs are blocked and `file://` requires `ALLOWED_FILE_DIRS` to include the absolute path), fall back to a direct Drive API multipart upload with the OAuth token in `~/.google_workspace_mcp/credentials/fasulo.nick@gmail.com.json`.

Reusable build/utility scripts still belong in `scripts/`; this rule is about one-off or non-code artifacts.
