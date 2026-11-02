---
description: "Don't add non-code files to the repo; drafts and screenshots go to Google Drive"
trigger: always_on
---

Do not add files to the repository that aren't part of the codebase's functionality — screenshots, Reddit/post drafts, marketing copy, captured artifacts, temp outputs, or notes files.

When the user asks for such files to be saved or kept, upload them to the user's Google Drive **Galaxy Movies** folder (folder id `1DwEVcNj5O9Ob4QPsmCPkSrWw-nyXWjTm`) via the google-workspace MCP instead of writing them into the repo. If they must exist locally to produce them (e.g. Playwright output), write them to an untracked location outside `src/` such as `shots/` and do not commit them.

Reusable build/utility scripts still belong in `scripts/`; this rule is about one-off or non-code artifacts.
