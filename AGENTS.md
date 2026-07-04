# lint

Monorepo housing all lint + format configuration for the f0rbit ecosystem. Five bun-workspace packages under the `@f0rbit` scope; consumers install only the umbrella `@f0rbit/lint`. See README.md for the two-layer model (oxlint fast gate → thin typed ESLint layer → oxfmt formatting).

## Layout

```
.
├── packages/
│   ├── oxlint-config/    # static oxlintrc.json — fast syntactic gate
│   ├── oxfmt-config/     # static oxfmtrc.json — tabs, width 120
│   ├── eslint-config/    # define_lint_config factory — thin typed layer
│   ├── eslint-plugin/    # custom org rules (phase 2 — f0rbit/must-use-result)
│   └── lint/             # umbrella: tool pins + f0rbit-lint bin + factory re-export
├── tests/                # root workspace-integrity tests
├── .plans/               # HTML plans (linting-strategy.html is the active plan)
└── .github/workflows/    # ci.yml (verify) + release.yml (tag-triggered publish)
```

Layout convention: `packages/<tool>-config` per toolchain — room is reserved for non-JS/TS languages later (e.g. `packages/rustfmt-config`).

## Scripts

```sh
bun run typecheck   # tsc --noEmit
bun test            # all workspace tests
bun run lint        # oxlint . && eslint .
bun run fmt         # oxfmt .
bun run fmt:check   # oxfmt --check .
bun run verify      # the CI gate — typecheck + test + lint + fmt:check
```

bun for everything — no npm/npx in scripts or workflows. CI pins bun 1.3.13 (1.3.14 segfaults — known from pulse CI).

## Conventions

- **This repo dogfoods its own configs.** Root `eslint.config.ts` calls `define_lint_config({ naming: "snake_case", ... })`; root `.oxlintrc.json` extends the workspace package; root `.oxfmtrc.json` is the canonical copy. Style: snake_case functions and variables, PascalCase types, kebab-case filenames, tabs.
- **Version pins are exact and single-sourced.** All tool binaries (`oxlint`, `oxfmt`, `eslint`, `typescript-eslint`, `jiti`) are exact-pinned in `packages/lint/package.json` ONLY. Sibling packages may repeat a pin as a devDependency for their own tests. Never introduce `^`/`~` for toolchain deps.
- **De-dupe regeneration rule:** whenever the pinned `oxlint` version is bumped, bump `eslint-plugin-oxlint` to the matching version in the SAME commit — its versions track oxlint's ruleset. The factory applies its de-dupe block LAST in the flat-config array; a version mismatch silently re-enables oxlint-owned rules in ESLint.
- **Factory contract:** `define_lint_config({ naming: "snake_case" | "camelCase", package_name?, tsconfig_root_dir, overrides? })` returns the flat-config array. Zod schema is the source of truth for the options type. Caller `overrides` splice in before the oxlint de-dupe block. Custom org rules get a marked insertion point (filled in phase 2).
- **Lockstep versioning, tag-triggered publish.** All packages share one version. Tag `v*` on main → release workflow verifies then `bun publish`es each workspace package (`NPM_TOKEN` secret; bun rewrites `workspace:*` to real versions at pack time).
- **Commit/PR title hygiene:** titles are plain conventional-commit descriptions — NEVER containing "phase", "task", plan names, or task IDs. Those details go in bodies. This repo is squash-merge only.
- **Exceptions are config-scoped, not comment-scoped.** Repo-specific allowlists go in `overrides` as `files`-scoped blocks in the consumer's `eslint.config.ts`. Inline `eslint-disable` needs a description; unused directives are errors.

## Gotchas

- oxlint errors hard on unknown rules in `oxlintrc.json` — a rule name that doesn't exist in the pinned version fails every lint run immediately. When bumping oxlint, run `bun run lint` before committing.
- oxfmt (0.x alpha) has NO `extends` in its config schema — consumer `.oxfmtrc.json` files are byte-copies of the canonical `packages/oxfmt-config/oxfmtrc.json`; `f0rbit-lint check` detects drift.
- oxlint's `extends` resolves relative paths reliably; node-specifier resolution is not guaranteed across alpha versions. Consumer stubs use `./node_modules/@f0rbit/oxlint-config/oxlintrc.json`.
