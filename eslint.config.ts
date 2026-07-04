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
	],
});
