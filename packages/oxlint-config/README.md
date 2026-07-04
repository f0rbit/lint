# @f0rbit/oxlint-config

Static oxlint configuration — the fast syntactic gate of the f0rbit two-layer lint model. No per-repo variation: naming presets and typed rules live in the ESLint layer (`@f0rbit/eslint-config`).

Enabled: `correctness` + `suspicious` categories as errors, plus explicit rules for the conventions oxlint owns natively (kebab-case filenames, `any`/non-null bans, max-depth 5, no-else-return, no-self-import).

## Usage

Consumers don't install this directly — install `@f0rbit/lint` and run `bunx f0rbit-lint init`, which writes the stub:

```json
{
	"extends": ["./node_modules/@f0rbit/oxlint-config/oxlintrc.json"]
}
```

The relative path is deliberate: node-specifier resolution in oxlint's `extends` is not guaranteed across alpha-era versions.

Repo-specific ignores go in the stub via `ignorePatterns` — the canonical file stays identical everywhere.

Pinned oxlint version lives in `@f0rbit/lint` (the umbrella package) — `eslint-plugin-oxlint` must be bumped to the matching version in the same commit.
