# Repository Maintenance Standards

## Stack & Architecture
- Framework: Next.js (App Router), TypeScript (Strict), Tailwind CSS.
- Testing: Playwright for E2E, Vitest for unit tests.

## Maintenance Rules
- **No Heavy Dependencies:** Do not add third-party libraries for tasks that native JS APIs (e.g., `fetch`, `Intl`, `Crypto`) can perform.
- **Dynamic Imports:** Any component over 50KB or loaded below the fold must use dynamic dynamic/lazy imports.
- **Verification Rule:** After editing files, run `npm run check` (Typecheck + Build). Fix any reported compiler errors before concluding.
- **Dead Code Policy:** When refactoring components, remove all unused exports, types, and styles immediately.

## Workflow Completion Protocol
- **Auto-Verification & Commit:** Once a maintenance or feature task is complete and all build/test checks pass, analyze the file diff (`git diff`).
- **Commit Format:** Generate a concise commit message following the [Conventional Commits](https://www.conventionalcommits.org) format (e.g., `refactor:`, `perf:`, `fix:`).
- **Execution:** Stage and commit updated files only when the user requests a commit. Never push automatically; pushing requires explicit user approval in the current conversation.
- **Visual Verification:** When changing UI, styling, layout, interaction, or visual performance behavior, start or reuse a local development/production preview after editing and visually verify the affected flow in a browser before concluding.

## Vercel Deployment Protocol
- **Trigger Deployment:** Upon pushing changes via `git push`, a Vercel Preview Deployment will automatically generate.
- **Inspect Live Build:** Use the Vercel CLI (`vercel inspect` or `vercel logs`) via terminal to monitor deployment status.
- **Deployment Error Remediation:** If the Vercel build fails in the cloud (e.g., middleware errors, missing environment variables, server-side rendering faults), pull the Vercel build logs, resolve the breaking issue locally, and push an update.