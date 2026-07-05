import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import f0rbit from "@f0rbit/eslint-plugin";
import type { Linter } from "eslint";
import functional from "eslint-plugin-functional";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import oxlint from "eslint-plugin-oxlint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { z } from "zod";
import { naming_convention_selectors, naming_convention_selectors_for_components } from "./presets.js";

const require_from_here = createRequire(import.meta.url);

const lint_options_schema = z.object({
	naming: z.enum(["snake_case", "camelCase"]),
	package_name: z.string().optional(),
	tsconfig_root_dir: z.string(),
	overrides: z.array(z.custom<Linter.Config>()).optional(),
	oxlintrc_path: z.string().optional(),
	// "node-esm" preserves this factory's original behaviour (explicit .js
	// extensions on relative imports — required for a published Node-ESM
	// library). "bundler" is for tsup/Vite/webpack-resolved packages that
	// write extensionless relative imports by convention.
	module_resolution: z.enum(["node-esm", "bundler"]).default("node-esm"),
	// Designated files where ambient effects (Date.now, new Date, Math.random)
	// are allowed — e.g., adapter/provider implementations that read time/rng
	// from injected sources in production but need ambient reads for setup/bootstrap.
	ambient_effect_files: z.array(z.string()).min(1).optional(),
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
				// Decision log: type aliases are the uniform type-level abstraction across the ecosystem; we avoid the interface/type distinction to reduce cognitive load.
				"@typescript-eslint/consistent-type-definitions": ["error", "type"],
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

// Placed after naming_convention() in the config array: flat config resolves a
// rule per-file from the LAST matching config, so this narrower files: **/*.tsx
// block wins for .tsx and naming_convention()'s base list stands for plain .ts.
function tsx_component_convention(preset: "snake_case" | "camelCase"): Linter.Config {
	return {
		files: ["**/*.tsx"],
		rules: {
			"@typescript-eslint/naming-convention": ["error", ...naming_convention_selectors_for_components(preset)],
		},
	};
}

// import-x's bundled default resolver only recognises ['.mjs', '.cjs', '.js',
// '.json', '.node'] — an extensionless relative specifier (the bundler
// convention) never resolves against it, so the rule falls back to treating
// the specifier as extension-less text and (wrongly) demands one even under
// "never". Bundler mode wires an explicit resolver-next with TS extensions
// added so extensionless specifiers actually resolve and the pattern below
// applies to the real (resolved) extension.
const bundler_resolver_extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".node"];
const bundler_import_resolver = createNodeResolver({ extensions: bundler_resolver_extensions });

// Non-code extensions (json, css, ...) stay on the ignorePackages default in
// both modes — bundlers still require an explicit extension for those; only
// the code extensions switch to "never" for bundler-resolved consumers.
const bundler_code_extensions_pattern: Record<string, "never"> = {
	ts: "never",
	tsx: "never",
	mts: "never",
	cts: "never",
	js: "never",
	jsx: "never",
	mjs: "never",
	cjs: "never",
};

function extensions_rule(module_resolution: "node-esm" | "bundler"): Linter.RuleEntry {
	if (module_resolution === "node-esm") return ["error", "ignorePackages"];
	return ["error", "ignorePackages", { pattern: bundler_code_extensions_pattern }];
}

function import_hygiene(package_name: string | undefined, module_resolution: "node-esm" | "bundler"): Linter.Config {
	const base: Linter.Config = {
		files: ts_files,
		plugins: { "import-x": importX },
		rules: {
			"import-x/extensions": extensions_rule(module_resolution),
			"import-x/no-self-import": "error",
		},
	};
	// node-esm mode is left byte-for-byte identical to the pre-0.1.4 config
	// (no settings block) — this is the "preserves corpus/vault/pulse
	// behaviour exactly" guarantee.
	const config: Linter.Config =
		module_resolution === "bundler"
			? { ...base, settings: { "import-x/resolver-next": [bundler_import_resolver] } }
			: base;
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

const runtime_checks: Linter.Config = {
	files: ts_files,
	rules: {
		// Decision log: console.* is for debugging and CI logs. Library/tool entrypoints use structured logging; production code directs output through designated channels. console.error for CLI error messages is the only standard exception — consoles.log/warn/info are typically forgotten debug statements.
		"no-console": "error",
	},
};

const org_rules: Linter.Config = {
	files: ts_files,
	plugins: { f0rbit },
	rules: {
		"f0rbit/must-use-result": "error",
		"f0rbit/prefer-pipe": "warn",
		"f0rbit/no-ambient-effects": "warn",
		"f0rbit/no-test-mocks": "error",
		"f0rbit/require-schema-at-boundary": "error",
	},
};

function oxlint_dedupe(oxlintrc_path: string | undefined): Linter.Config[] {
	const local = resolve(oxlintrc_path ?? "./.oxlintrc.json");
	const source = existsSync(local) ? local : require_from_here.resolve("@f0rbit/oxlint-config/oxlintrc.json");
	return oxlint.buildFromOxlintConfigFile(source);
}

export function define_lint_config(options: LintOptions): Linter.Config[] {
	const parsed = lint_options_schema.parse(options);
	const ambient_effect_allowlist: Linter.Config[] = parsed.ambient_effect_files
		? [{ files: parsed.ambient_effect_files, rules: { "f0rbit/no-ambient-effects": "off" } } satisfies Linter.Config]
		: [];
	return [
		global_ignores,
		...typed_family(parsed.tsconfig_root_dir),
		functional_discipline,
		naming_convention(parsed.naming),
		tsx_component_convention(parsed.naming),
		import_hygiene(parsed.package_name, parsed.module_resolution),
		commented_code,
		runtime_checks,
		org_rules,
		...ambient_effect_allowlist,
		...(parsed.overrides ?? []),
		...oxlint_dedupe(parsed.oxlintrc_path),
	];
}
