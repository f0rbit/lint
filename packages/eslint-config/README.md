# @f0rbit/eslint-config

The thin typed layer of the f0rbit two-layer lint model. Carries ONLY what oxlint can't do: the type-aware rule family, functional discipline, selector-granular naming-convention, import hygiene, no-commented-code — de-duplicated against oxlint LAST via `eslint-plugin-oxlint`.

## Usage

Consumers install `@f0rbit/lint` (which re-exports this factory) and write:

```ts
// eslint.config.ts
import { define_lint_config } from "@f0rbit/lint";

export default define_lint_config({
	naming: "snake_case", // or "camelCase"
	package_name: "@f0rbit/corpus", // optional — bans importing your own package name
	tsconfig_root_dir: import.meta.dirname,
	overrides: [], // files-scoped repo exceptions, spliced in before the oxlint de-dupe
});
```

## Options

Zod-validated (`LintOptions` is inferred from the schema — single source of truth):

| Option              | Type                          | Effect                                                                                                                                           |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `naming`            | `"snake_case" \| "camelCase"` | Function-name preset. Variables are snake_case (+UPPER_CASE consts) and types PascalCase in both.                                                |
| `package_name`      | `string?`                     | Adds a `no-restricted-imports` ban on the repo's own package name.                                                                               |
| `tsconfig_root_dir` | `string`                      | Passed to typescript-eslint's `projectService` — typed rules run on the real TS program.                                                         |
| `overrides`         | `Linter.Config[]?`            | Repo-specific `files`-scoped exceptions. Spliced in before the oxlint de-dupe block.                                                             |
| `oxlintrc_path`     | `string?`                     | The `.oxlintrc.json` to de-dupe against. Defaults to `./.oxlintrc.json`, falling back to the canonical `@f0rbit/oxlint-config` copy when absent. |

## Layer order

1. Global ignores (`dist`, `node_modules`, `coverage`, `docs`, `.plans`)
2. typescript-eslint `strictTypeChecked` + `projectService`, plus `no-floating-promises`, `switch-exhaustiveness-check`, `prefer-readonly`, `consistent-type-assertions` (no object-literal assertions), inline `consistent-type-imports`, and the enum ban (`no-restricted-syntax`)
3. `eslint-plugin-functional`: `no-classes`, `no-this-expressions`, `no-throw-statements`, `no-try-statements`
4. `@typescript-eslint/naming-convention` built from the preset
5. `eslint-plugin-import-x`: extensions on relative imports, `no-self-import`, own-package ban
6. `eslint-plugin-sonarjs`: `no-commented-code`
7. Custom org rules insertion point (phase 2: `f0rbit/must-use-result`)
8. Caller `overrides`
9. LAST: `eslint-plugin-oxlint` de-dupe — every rule oxlint owns is disabled here

`linterOptions.reportUnusedDisableDirectives` is `"error"`: stale inline disables fail the lint.

Note: filename-case is NOT in this layer — oxlint owns it natively.
