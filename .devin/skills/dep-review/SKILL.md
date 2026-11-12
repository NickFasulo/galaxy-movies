---
name: dep-review
description: Supply-chain review for dependency changes — Dependabot PR triage, npm audit, publish-age and lockfile checks, and @opennextjs/cloudflare patch-drift re-verification. Use when reviewing a Dependabot PR, adding a dependency, triaging npm audit, or after a package upgrade.
---

# Dependency review

## Dependabot PRs

`dependabot-automerge.yml` merges on a green `check`. Before approving or
debugging:

- CI red across ALL Dependabot PRs → check the Dependabot secret scope first
  (`gh secret list --app dependabot`): `TMDB_API_KEY` and `WATCHMODE_API_KEY`
  must exist there or `smoke:workerd` fails. It's a separate store from
  Actions secrets — a missing one fails every Dependabot run, not just one PR.
- Read the lockfile diff, not just `package.json`:
  - `resolved` URLs must stay on `registry.npmjs.org` — a switch to a
    tarball/git host is a red flag
  - new `git+`/`file:`/URL deps, dropped `integrity` fields, or new
    `postinstall`/`preinstall`/`install` scripts need a human look before merge
- Check the bumped version's age: `npm view <pkg>@<ver> time` — under ~7
  days is unvetted; a non-trivial share of supply-chain attacks get caught
  and yanked inside that window.

## Adding a new dep

```bash
npm view <pkg> time version          # publish age + latest
npm view <pkg> maintainers repository.url
npm audit                            # baseline before adding
```

Prefer versions ≥7 days old; add with `npm add <pkg>@<ver>` matching the
repo's existing pin style. If the package ships install scripts, that's a
conversation, not a merge.

## npm audit triage

- `npm audit --omit=dev` separates prod exposure from dev-tooling noise;
  most hits here are dev-only.
- Fix via `npm update <pkg>` or an `overrides` entry for transitive pins —
  don't bump a direct dep to a <7-day-old release just to silence audit.
- Report per finding: CVE/advisory, prod vs dev, whether the vulnerable path
  is actually reachable (a lodash CVE in a test-only tool is not the same as
  one in the worker bundle).

## After upgrading @opennextjs/cloudflare

The repo carries `patches/@opennextjs+cloudflare+*.patch` applied by
`postinstall` (patch-package). After ANY version bump:

```bash
npx patch-package @opennextjs/cloudflare   # re-apply / detect drift
npm run cf:build && npm run smoke:workerd  # the only real verification
```

A patch failing to apply cleanly = drift — re-derive the stub changes
(AGENTS.md documents what they do) before redeploying.

## House quirks

- `typescript` is aliased (`npm:@typescript/typescript6`) while `typecheck`
  runs TS7 native via `@typescript/native`. Don't "fix" the split without
  checking typescript-eslint#10940 status — the alias exists because tools
  need the classic JS API TS7 doesn't ship.
- `scripts/` is plain JS build tooling — its deps count for supply chain too.
