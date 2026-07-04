# @f0rbit/lint

The umbrella package — the ONLY dependency a consumer repo installs for the full f0rbit lint + format toolchain. Carries exact pins for every tool binary (`oxlint`, `oxfmt`, `eslint`, `typescript-eslint`, `jiti`) and the three config packages; bun hoists the transitive bins into `node_modules/.bin`.

## Install

```sh
bun add -d -E @f0rbit/lint
bunx f0rbit-lint init
```

`init` writes the consumer stubs and merges scripts into `package.json` (never clobbering existing entries):

| Artifact           | Shape                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `.oxlintrc.json`   | 3-line stub extending `./node_modules/@f0rbit/oxlint-config/oxlintrc.json` — add repo `ignorePatterns` here                   |
| `.oxfmtrc.json`    | Byte-copy of the canonical `@f0rbit/oxfmt-config` file (oxfmt has no `extends`) — repo format ignores go in `.prettierignore` |
| `eslint.config.ts` | `define_lint_config({...})` factory call — adjust `naming` preset and `overrides`                                             |
| scripts            | `lint`, `lint:fix`, `fmt`, `fmt:check`                                                                                        |

`init` is idempotent and refuses to overwrite existing files without `--force`.

## Drift detection

```sh
bunx f0rbit-lint check
```

Verifies `.oxfmtrc.json` still byte-matches the canonical copy and `.oxlintrc.json` still extends the shared config. Non-zero exit on drift — wire it into CI if the repo has a history of local config edits.

## Factory re-export

```ts
import { define_lint_config } from "@f0rbit/lint";
```

See `@f0rbit/eslint-config` for options.
