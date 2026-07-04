import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import f0rbit from "@f0rbit/eslint-plugin";
import type { Linter } from "eslint";
import functional from "eslint-plugin-functional";
import { importX } from "eslint-plugin-import-x";
import oxlint from "eslint-plugin-oxlint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { z } from "zod";
import { naming_convention_selectors } from "./presets.js";

const require_from_here = createRequire(import.meta.url);

const lint_options_schema = z.object({
	naming: z.enum(["snake_case", "camelCase"]),
	package_name: z.string().optional(),
	tsconfig_root_dir: z.string(),
	overrides: z.array(z.custom<Linter.Config>()).optional(),
	oxlintrc_path: z.string().optional(),
});

export type LintOptions = z.input<typeof lint_options_schema>;

const ts_files = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];

const global_ignores: Linter.Config = {
	ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "docs/**", ".plans/**"],
};

const scope_to_ts = (config: Linter.Config): Linter.Config => ({ ...config, files: ts_files });

function typed_family(tsconfig_root_dir: string): Linter.Config[] {
	const strict_type_checked = tseslint.configs.strictTypeChecked;
	return [
		...strict_type_checked.map(scope_to_ts),
		{
			files: ts_files,
			languageOptions: {
				parserOptions: {
					projectService: { allowDefaultProject: ["eslint.config.ts"] },
					tsconfigRootDir: tsconfig_root_dir,
				},
			},
			linterOptions: { reportUnusedDisableDirectives: "error" },
			rules: {
				"@typescript-eslint/no-floating-promises": "error",
				"@typescript-eslint/switch-exhaustiveness-check": "error",
				"@typescript-eslint/prefer-readonly": "error",
				"@typescript-eslint/consistent-type-assertions": [
					"error",
					{ assertionStyle: "as", objectLiteralTypeAssertions: "never" },
				],
				"@typescript-eslint/consistent-type-imports": [
					"error",
					{ prefer: "type-imports", fixStyle: "inline-type-imports" },
				],
				// Decision log: the annotate-at-boundaries convention keeps type args explicit even when they equal the default (Result<T, CorpusError>) — the strict preset flags exactly those deliberate annotations.
				"@typescript-eslint/no-unnecessary-type-arguments": "off",
				// Decision log: provider-pattern in-memory implementations satisfy Promise-returning interfaces with awaitless async methods; the rule has no interface-implementation allowance.
				"@typescript-eslint/require-await": "off",
				"no-restricted-syntax": [
					"error",
					{ selector: "TSEnumDeclaration", message: "Enums are banned — use a string literal union." },
				],
			},
		},
	];
}

const functional_discipline: Linter.Config = {
	files: ts_files,
	plugins: { functional },
	rules: {
		"functional/no-classes": "error",
		"functional/no-this-expressions": "error",
		"functional/no-throw-statements": "error",
		"functional/no-try-statements": "error",
	},
};

function naming_convention(preset: "snake_case" | "camelCase"): Linter.Config {
	return {
		files: ts_files,
		rules: {
			"@typescript-eslint/naming-convention": ["error", ...naming_convention_selectors(preset)],
		},
	};
}

function import_hygiene(package_name: string | undefined): Linter.Config {
	const config: Linter.Config = {
		files: ts_files,
		plugins: { "import-x": importX },
		rules: {
			"import-x/extensions": ["error", "ignorePackages"],
			"import-x/no-self-import": "error",
		},
	};
	if (!package_name) return config;
	return {
		...config,
		rules: {
			...config.rules,
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [package_name, `${package_name}/*`],
							message: `Use relative imports inside ${package_name}, not the package name.`,
						},
					],
				},
			],
		},
	};
}

const commented_code: Linter.Config = {
	files: ts_files,
	plugins: { sonarjs },
	rules: { "sonarjs/no-commented-code": "error" },
};

const org_rules: Linter.Config = {
	files: ts_files,
	plugins: { f0rbit },
	rules: { "f0rbit/must-use-result": "error" },
};

function oxlint_dedupe(oxlintrc_path: string | undefined): Linter.Config[] {
	const local = resolve(oxlintrc_path ?? "./.oxlintrc.json");
	const source = existsSync(local) ? local : require_from_here.resolve("@f0rbit/oxlint-config/oxlintrc.json");
	return oxlint.buildFromOxlintConfigFile(source);
}

export function define_lint_config(options: LintOptions): Linter.Config[] {
	const parsed = lint_options_schema.parse(options);
	return [
		global_ignores,
		...typed_family(parsed.tsconfig_root_dir),
		functional_discipline,
		naming_convention(parsed.naming),
		import_hygiene(parsed.package_name),
		commented_code,
		org_rules,
		...(parsed.overrides ?? []),
		...oxlint_dedupe(parsed.oxlintrc_path),
	];
}
