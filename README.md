# @f0rbit/lint

Single source of truth for lint + format configuration across the f0rbit ecosystem (corpus, pulse, vault, devpad, ui, and packages scaffolded by `devpad pipelines init`).

## The two-layer model

Linting is split across two tools, formatting is owned by a third — all from one install:

1. **oxlint** — the fast syntactic gate. Runs the broad rule set (correctness, suspicious, naming of files, `any` bans, depth limits) in milliseconds. First CI step, editor-save candidate.
2. **ESLint (thin typed layer)** — carries ONLY what oxlint can't: the type-aware rule family (`no-floating-promises`, `no-unsafe-*`, `switch-exhaustiveness-check`), functional discipline (`no-classes`, `no-throw-statements`), selector-granular naming-convention, import hygiene, and custom org rules (e.g. `f0rbit/must-use-result`). De-duplicated against oxlint via `eslint-plugin-oxlint`, applied LAST — any rule oxlint owns is disabled on the ESLint side.
3. **oxfmt** — owns formatting everywhere. Tabs, print width 120, otherwise Prettier-compatible defaults. CI runs check mode only; CI never rewrites code.

## Install (consumers)

Consumers depend on exactly ONE package:

```sh
bun add -d -E @f0rbit/lint
bunx f0rbit-lint init
```

`init` writes the consumer stubs (`.oxlintrc.json`, `.oxfmtrc.json`, `eslint.config.ts`) and merges `lint` / `lint:fix` / `fmt` / `fmt:check` scripts into `package.json`. `f0rbit-lint check` verifies the copied configs haven't drifted from the canonical package copies.

The umbrella package carries all tool binaries as exact-pinned dependencies; bun hoists their bins into `node_modules/.bin`, so `oxlint`, `eslint`, and `oxfmt` resolve in scripts with no further installs.

## The factory

ESLint config is a factory function, parameterised per repo:

```ts
// eslint.config.ts
import { define_lint_config } from "@f0rbit/lint";

export default define_lint_config({
	naming: "snake_case", // or "camelCase" — function-name preset
	package_name: "@f0rbit/corpus", // optional: bans importing your own package name
	tsconfig_root_dir: import.meta.dirname,
	overrides: [], // repo-specific files-scoped exceptions, spliced in before the oxlint de-dupe
});
```

Two naming presets, one definition:

| Preset | Functions | Variables | Types |
|---|---|---|---|
| `snake_case` (corpus) | `create_corpus` | snake_case + UPPER_CASE consts | PascalCase |
| `camelCase` (scaffolded packages) | `createCorpus` | snake_case + UPPER_CASE consts | PascalCase |

Exceptions are **config-scoped, not comment-scoped**: known allowlists go in `overrides` as `files`-scoped blocks. Inline `eslint-disable` requires a description, and unused directives are errors.

## Packages

| Package | Contents |
|---|---|
| `@f0rbit/lint` | Umbrella — the only consumer install. Tool binaries (exact pins), `f0rbit-lint` bin, factory re-export |
| `@f0rbit/oxlint-config` | Static `oxlintrc.json` — the fast syntactic gate |
| `@f0rbit/oxfmt-config` | Static `oxfmtrc.json` — tabs, width 120 |
| `@f0rbit/eslint-config` | `define_lint_config` factory — the thin typed layer |
| `@f0rbit/eslint-plugin` | Custom org rules (`f0rbit/must-use-result`) — phase 2 |

Layout convention is `packages/<tool>-config` per toolchain, reserving room for non-JS languages later (e.g. a future `packages/rustfmt-config`).

## Version-pinning policy

- Every tool and plugin version is an **exact pin** (no `^`/`~`).
- All tool pins live in **one** `package.json` — `packages/lint` — so bumping oxlint/oxfmt for the whole ecosystem is a one-file change. Sibling packages may repeat pins as devDependencies for their own tests only.
- **`oxlint` and `eslint-plugin-oxlint` bump together, in the same commit.** `eslint-plugin-oxlint`'s versions track oxlint's ruleset (1.72.0 ↔ 1.72.0); mismatched versions silently break the de-dupe, re-enabling rules on the ESLint side that oxlint already owns.
- oxlint/oxfmt are alpha-fast-moving — accepted risk. Normalization commits in consumer repos are isolated PRs recorded in `.git-blame-ignore-revs`.

## Release

Lockstep versioning: all five packages share one version number. Pushing a `v*` tag triggers the release workflow, which verifies and publishes every workspace package to npm.

## Development

```sh
bun install
bun run verify   # typecheck + test + lint + fmt:check
```

This repo dogfoods its own configs — the root `eslint.config.ts`, `.oxlintrc.json`, and `.oxfmtrc.json` consume the workspace packages directly.
