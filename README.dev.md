# Developer Guide

## Binary assets and pre-commit

Install [`pre-commit`](https://pre-commit.com/) and run `pre-commit install` to avoid accidentally committing binary diffs. The hooks block common media/model formats so that anything large or binary lands on a Git LFS-backed branch instead of the main repo history.

When you need to share videos, weights, fonts, or similar assets, push them to the dedicated Git LFS branch and reference them from your change notes instead of committing them directly.

## Run CI checks locally

- Use Node 18 (matching `.nvmrc` and the CI workflow). If you use `nvm`, run `nvm use` from the repo root before running the checks.
- `npm run ci:local` runs the full set of CI checks: web typecheck → web build → web unit tests, followed by the mobile Vitest suite and mobile typecheck.
- For focused work, you can run subsets individually:
  - `npm run ci:web` (web typecheck + build + unit tests)
  - `npm run ci:mobile` (mobile Vitest suite + mobile typecheck)

## Mobile Vitest quickstart

- `npm --prefix apps/mobile test -- <filePattern>` runs the React Native Vitest suite (for example `PracticeMissionsScreen.test.tsx`).
- `npm --prefix apps/mobile run typecheck` verifies the mobile app and test TypeScript types, including Vitest globals.

These mobile commands still work, but the repository also provides the aggregated `npm run ci:mobile` and `npm run ci:local` helpers from the repo root to mirror the CI pipeline without remembering individual prefixes.
