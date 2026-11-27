# ADR-022: Fast Feedback Loop for AI Agents

## Status
**Implemented** - 2026-11

## Context

The project is built and maintained by AI agents. Agents rely on tool output
(type errors, lint, tests) to correct themselves, and they run these tools far
more often than humans, often in several git worktrees at once. In November
2026:

- the pre-commit hook ran the full lint twice plus every audit (~90 s per
  commit), so agents waited or bypassed it;
- `tsc` only checked `src/` without unit tests: 117 type errors had piled up in
  tests and BDD steps (including steps calling a mock method that does not
  exist);
- agent guidance was spread over `.github/copilot-instructions.md`,
  `.cursorrules`, two prompt files and several docs, which had drifted from
  the code and from each other;
- tools overlapped (madge vs dependency-cruiser) or produced unused output
  (typedoc), and CI ran everything in one serial job.

## Decision

- **One instruction file:** `AGENTS.md` at the root is the single source of
  truth for agents (read natively by most coding agents);
  `.github/copilot-instructions.md` only points to it. Detail lives in
  `docs/architecture.md`, `docs/glossary.md` and the ADRs.
- **Typecheck everything:** `tsconfig.json` covers src, tests, features,
  scripts and workers; ESLint's project service uses the same tsconfig.
- **Hooks:** pre-commit = lint-staged (ESLint/stylelint on staged files),
  typecheck, unit tests (~15 s). Pre-push = `npm run check` (full gate).
- **Lint cache:** `npm run lint` uses ESLint's cache (warm ~5 s); CI lints
  without a cache because typed rules can depend on other files.
- **Parallel CI:** static checks, unit tests with coverage, two E2E shards
  with cached browsers, and build/size/Lighthouse run as separate jobs.
- **Worktree-safe E2E:** `PORT=<n> npm run test:e2e` starts a dev server on
  its own port.
- **Fewer, non-overlapping tools:** dependency-cruiser covers cycles (madge
  removed); typedoc and eslint-plugin-security removed.

TypeScript 7 (native compiler) was evaluated: typed linting
(typescript-eslint 8.x) does not support it yet, and `tsc` already takes ~3 s.
Revisit when typescript-eslint supports TS 7. oxlint was evaluated as well:
most of the lint time is building the TypeScript program for typed rules, which
oxlint's default rules would not replace.

## Consequences

- Commits are cheap enough that agents keep hooks enabled; the full gate runs
  before pushing and in CI.
- Changes to conventions must update `AGENTS.md` in the same commit.
