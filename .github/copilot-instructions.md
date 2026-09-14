# Repository Maintenance Standards

## Stack & Architecture
- Framework: Next.js (App Router), TypeScript (Strict), Tailwind CSS.
- Testing: Playwright for E2E, Vitest for unit tests.

## Maintenance Rules
- **No Heavy Dependencies:** Do not add third-party libraries for tasks that native JS APIs (e.g., `fetch`, `Intl`, `Crypto`) can perform.
- **Dynamic Imports:** Any component over 50KB or loaded below the fold must use dynamic dynamic/lazy imports.
- **Verification Rule:** After editing files, run `npm run check` (Typecheck + Build). Fix any reported compiler errors before concluding.
- **Dead Code Policy:** When refactoring components, remove all unused exports, types, and styles immediately.