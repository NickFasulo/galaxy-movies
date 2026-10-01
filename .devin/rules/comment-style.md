---
description: "Keep code comments minimal"
trigger: always_on
---

Write as few comments as possible. Do not add comments that restate what the code does, describe syntax, or narrate the diff.

Only add a comment when it carries context a future agent or model would need that isn't inferable from the code itself — e.g. why a workaround exists, an external constraint (API limits, SEO requirements, caching behavior), or a non-obvious integration dependency. Keep those comments short.

Do not remove existing comments unless asked.
