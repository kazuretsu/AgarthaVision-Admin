# Changelog

Newest first. One entry per commit that changes behavior or contract.

## [ci] Configure Husky git hooks for typecheck, test, and build verification

Ported the Android repo's hook discipline to the Next.js toolchain. `pre-commit` gates on
four numbered steps — typecheck, unit tests, production build, eslint plus prettier — each
with its own failure message and non-zero exit. `pre-push` repeats the full build.
`commit-msg` enforces `[type][ClickUp-ID][Lastname] Task title` and prints the expected
format on rejection. `run_bun()` mirrors the sibling's `run_gradle()`. Added
`lint-staged.config.js` and `commitlint.config.js` with a `scope-enum` for this repo's
areas.

## [chore] Scaffold Next.js admin console with TypeScript and Tailwind

Next.js 16 App Router, React 19, TypeScript `strict`, Tailwind v4, ESLint, Prettier,
Vitest. Design tokens mirror the Android client's palette. `.env.example` carries variable
names with empty values; `.env.local` is gitignored.
