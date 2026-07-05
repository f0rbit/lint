import { define_lint_config } from "@f0rbit/lint";

export default define_lint_config({
	naming: "snake_case",
	tsconfig_root_dir: import.meta.dirname,
	overrides: [
		{
			// deliberately-broken lint/format fixtures — excluded from all three tools
			ignores: ["packages/*/tests/fixtures/**", "**/tests/.tmp/**"],
		},
		{
			// test code may throw (assertion helpers); production source may not
			files: ["tests/**", "packages/*/tests/**"],
			rules: { "functional/no-throw-statements": "off" },
		},
		{
			// CLI entrypoint uses console.error for errors and console.log for user messaging
			files: ["packages/lint/src/bin.ts"],
			rules: { "no-console": "off" },
		},
		{
			// These JSON.parse reads are test-infrastructure reads of this repo's
			// own generated output (bun pm pack manifests, oxlint's own JSON
			// report, a scaffolded consumer's package.json written earlier in the
			// same test) — not external trust boundaries, so a Zod parse here
			// would just be test-code churn with no real safety benefit.
			files: [
				"tests/workspace.test.ts",
				"packages/lint/tests/init.test.ts",
				"packages/oxlint-config/tests/oxlint-fixtures.test.ts",
			],
			rules: { "f0rbit/require-schema-at-boundary": "off" },
		},
	],
});
