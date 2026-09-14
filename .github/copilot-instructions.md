# Repository Maintenance Standards

## Stack & Architecture
- Framework: Next.js with TypeScript
- UI: Chakra UI and custom CSS
- Testing: Playwright for E2E, Vitest for unit tests

## Maintenance Rules
- Prefer native browser APIs such as `fetch`, `Intl`, and `crypto` before adding third-party packages.
- Use dynamic imports for components that are below the fold or large enough to impact initial bundle size.
- Remove unused exports, dead code, stale utilities, and redundant styles when refactoring.
- Keep the app lean: avoid introducing heavy dependencies for small tasks.

## Verification
- Run the smallest relevant project validation command after making changes.
- Fix all TypeScript, lint, and build errors before considering work complete.
- Prefer existing repository scripts and tooling over ad-hoc checks.

## Workflow
- Keep changes focused and scoped to the task.
- Validate the affected behavior before concluding.
- Document any intentional trade-offs in code comments only when necessary.
