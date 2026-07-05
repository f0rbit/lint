import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { Linter } from "eslint";
import { define_lint_config, type LintOptions } from "../src/index.js";

const fixtures_dir = join(import.meta.dirname, "fixtures");

const base_options = { naming: "snake_case", tsconfig_root_dir: fixtures_dir } as const;

type NamingSelector = {
	selector: string | string[];
	format: string[] | null;
	types?: string[];
	modifiers?: string[];
};

const naming_selectors = (configs: Linter.Config[]): NamingSelector[] => {
	const entry = configs
		.map((config) => config.rules?.["@typescript-eslint/naming-convention"])
		.find((rule) => Array.isArray(rule));
	if (!Array.isArray(entry)) throw new Error("naming-convention rule not found in config array");
	return entry.slice(1) as NamingSelector[];
};

const is_dedupe_config = (config: Linter.Config): boolean => (config.name ?? "").startsWith("oxlint/");

const function_format = (selectors: NamingSelector[]): string[] | null | undefined =>
	selectors.find((selector) => selector.selector === "function")?.format;

const find_ban = (configs: Linter.Config[]): unknown =>
	configs.map((config) => config.rules?.["no-restricted-imports"]).find((rule) => rule !== undefined);

const effective_setting = (configs: Linter.Config[], rule: string): unknown =>
	configs.reduce<unknown>((setting, config) => config.rules?.[rule] ?? setting, undefined);

const collect_dedupe_rules = (configs: Linter.Config[]): Partial<Linter.RulesRecord> =>
	configs
		.filter(is_dedupe_config)
		.reduce<Partial<Linter.RulesRecord>>((merged, config) => ({ ...merged, ...config.rules }), {});

describe("define_lint_config factory", () => {
	it("starts with global ignores", () => {
		const [first] = define_lint_config(base_options);
		expect(first?.ignores).toContain("**/dist/**");
		expect(first?.ignores).toContain(".plans/**");
	});

	it("flips the function-name format between presets", () => {
		const snake = naming_selectors(define_lint_config(base_options));
		const camel = naming_selectors(define_lint_config({ ...base_options, naming: "camelCase" }));
		expect(function_format(snake)).toEqual(["snake_case"]);
		expect(function_format(camel)).toEqual(["camelCase"]);
	});

	it("keeps types PascalCase and variables snake_case in both presets", () => {
		for (const naming of ["snake_case", "camelCase"] as const) {
			const selectors = naming_selectors(define_lint_config({ ...base_options, naming }));
			expect(selectors.find((selector) => selector.selector === "typeLike")?.format).toEqual(["PascalCase"]);
			expect(
				selectors.find((selector) => selector.selector === "variable" && !selector.types && !selector.modifiers)
					?.format,
			).toContain("snake_case");
		}
	});

	it("places the oxlint de-dupe block last, after caller overrides", () => {
		const override: Linter.Config = { name: "test/override", rules: { "no-console": "error" } };
		const configs = define_lint_config({ ...base_options, overrides: [override] });
		const override_index = configs.findIndex((config) => config.name === "test/override");
		const first_dedupe_index = configs.findIndex(is_dedupe_config);
		expect(override_index).toBeGreaterThan(-1);
		expect(first_dedupe_index).toBeGreaterThan(override_index);
		for (const config of configs.slice(first_dedupe_index)) expect(is_dedupe_config(config)).toBe(true);
		const last = configs.at(-1);
		expect(last).toBeDefined();
	});

	it("disables oxlint-owned rules in the de-dupe block", () => {
		const dedupe_rules = collect_dedupe_rules(define_lint_config(base_options));
		expect(dedupe_rules["no-else-return"]).toBe("off");
		expect(dedupe_rules["@typescript-eslint/no-explicit-any"]).toBe("off");
		expect(dedupe_rules["unicorn/filename-case"]).toBe("off");
	});

	it("resolves extends when de-duping from a consumer stub", () => {
		const dedupe_rules = collect_dedupe_rules(
			define_lint_config({ ...base_options, oxlintrc_path: join(fixtures_dir, "oxlintrc-stub.json") }),
		);
		expect(dedupe_rules["no-else-return"]).toBe("off");
	});

	it("keeps the decision-log preset disables off through the full config array", () => {
		const configs = define_lint_config(base_options);
		expect(effective_setting(configs, "@typescript-eslint/no-unnecessary-type-arguments")).toBe("off");
		expect(effective_setting(configs, "@typescript-eslint/require-await")).toBe("off");
	});

	it("drops the oxlint-off rule from the de-dupe without re-enabling an eslint counterpart", () => {
		const configs = define_lint_config(base_options);
		expect(collect_dedupe_rules(configs)["import/no-named-as-default-member"]).toBeUndefined();
		const named_as_default_member = ["import/no-named-as-default-member", "import-x/no-named-as-default-member"];
		const enabled_somewhere = configs.some((config) =>
			named_as_default_member.some((rule) => {
				const setting = config.rules?.[rule];
				return setting !== undefined && setting !== "off";
			}),
		);
		expect(enabled_somewhere).toBe(false);
	});

	it("bans the repo's own package name only when provided", () => {
		expect(find_ban(define_lint_config(base_options))).toBeUndefined();
		const banned = find_ban(define_lint_config({ ...base_options, package_name: "@f0rbit/example" }));
		expect(JSON.stringify(banned)).toContain("@f0rbit/example");
	});

	it("errors unused disable directives", () => {
		const configs = define_lint_config(base_options);
		const linter_options = configs.find((config) => config.linterOptions)?.linterOptions;
		expect(linter_options?.reportUnusedDisableDirectives).toBe("error");
	});

	it("registers the f0rbit plugin and enables must-use-result in both presets", () => {
		for (const naming of ["snake_case", "camelCase"] as const) {
			const configs = define_lint_config({ ...base_options, naming });
			const org_config = configs.find((config) => config.plugins?.["f0rbit"]);
			expect(org_config).toBeDefined();
			expect(org_config?.rules?.["f0rbit/must-use-result"]).toBe("error");
		}
	});

	it("places org rules before caller overrides so repos can scope exceptions", () => {
		const override: Linter.Config = { name: "test/override", rules: { "f0rbit/must-use-result": "off" } };
		const configs = define_lint_config({ ...base_options, overrides: [override] });
		const org_index = configs.findIndex((config) => config.rules?.["f0rbit/must-use-result"] === "error");
		const override_index = configs.findIndex((config) => config.name === "test/override");
		expect(org_index).toBeGreaterThan(-1);
		expect(override_index).toBeGreaterThan(org_index);
	});

	it("rejects invalid options via the zod schema", () => {
		const bad_naming: unknown = { naming: "kebab-case", tsconfig_root_dir: fixtures_dir };
		const missing_root: unknown = { naming: "snake_case" };
		expect(() => define_lint_config(bad_naming as LintOptions)).toThrow();
		expect(() => define_lint_config(missing_root as LintOptions)).toThrow();
	});

	it("includes ambient_effect_files allowlist when provided", () => {
		const configs = define_lint_config({
			...base_options,
			ambient_effect_files: ["src/adapter/**", "src/provider/**"],
		});
		const allowlist_config = configs.find(
			(config) => config.files && config.rules?.["f0rbit/no-ambient-effects"] === "off",
		);
		expect(allowlist_config).toBeDefined();
		expect(allowlist_config?.files).toEqual(["src/adapter/**", "src/provider/**"]);
	});

	it("positions ambient_effect_files allowlist after org_rules and before overrides", () => {
		const override: Linter.Config = { name: "test/override", rules: { "f0rbit/no-ambient-effects": "warn" } };
		const configs = define_lint_config({
			...base_options,
			ambient_effect_files: ["src/adapter/**"],
			overrides: [override],
		});
		const org_index = configs.findIndex((config) => config.rules?.["f0rbit/no-ambient-effects"] === "warn");
		const allowlist_index = configs.findIndex(
			(config) => config.files && config.rules?.["f0rbit/no-ambient-effects"] === "off",
		);
		const override_index = configs.findIndex((config) => config.name === "test/override");
		expect(org_index).toBeGreaterThan(-1);
		expect(allowlist_index).toBeGreaterThan(org_index);
		expect(override_index).toBeGreaterThan(allowlist_index);
	});

	it("omits ambient_effect_files config when option not provided", () => {
		const configs = define_lint_config(base_options);
		const allowlist_config = configs.find(
			(config) => config.files && config.rules?.["f0rbit/no-ambient-effects"] === "off",
		);
		expect(allowlist_config).toBeUndefined();
	});

	it("rejects ambient_effect_files as empty array via zod schema", () => {
		const bad_ambient_files: unknown = {
			naming: "snake_case",
			tsconfig_root_dir: fixtures_dir,
			ambient_effect_files: [],
		};
		expect(() => define_lint_config(bad_ambient_files as LintOptions)).toThrow();
	});

	it("enables consistent-type-definitions: error, type for both presets", () => {
		for (const naming of ["snake_case", "camelCase"] as const) {
			const configs = define_lint_config({ ...base_options, naming });
			const setting = effective_setting(configs, "@typescript-eslint/consistent-type-definitions");
			expect(setting).toEqual(["error", "type"]);
		}
	});

	it("enables no-console: error for both presets", () => {
		for (const naming of ["snake_case", "camelCase"] as const) {
			const configs = define_lint_config({ ...base_options, naming });
			const setting = effective_setting(configs, "no-console");
			expect(setting).toBe("error");
		}
	});

	it("keeps consistent-type-definitions and no-console enabled through the full config array (de-dupe survival)", () => {
		const configs = define_lint_config(base_options);
		const dedupe_rules = collect_dedupe_rules(configs);
		// These rules shouldn't be in the de-dupe block at all (they're not oxlint rules)
		expect(dedupe_rules["@typescript-eslint/consistent-type-definitions"]).toBeUndefined();
		expect(dedupe_rules["no-console"]).toBeUndefined();
		// Verify the rules remain enabled in the final effective setting
		expect(effective_setting(configs, "@typescript-eslint/consistent-type-definitions")).toEqual(["error", "type"]);
		expect(effective_setting(configs, "no-console")).toBe("error");
	});
});
