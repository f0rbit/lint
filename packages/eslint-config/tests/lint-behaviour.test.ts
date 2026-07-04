import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ESLint } from "eslint";
import { define_lint_config } from "../src/index.js";

const fixtures_dir = join(import.meta.dirname, "fixtures");

const create_runner = (naming: "snake_case" | "camelCase", module_resolution?: "node-esm" | "bundler") =>
	new ESLint({
		cwd: fixtures_dir,
		overrideConfigFile: true,
		overrideConfig: define_lint_config({ naming, tsconfig_root_dir: fixtures_dir, module_resolution }),
	});

const rule_ids = async (runner: ESLint, file: string): Promise<string[]> => {
	const results = await runner.lintFiles([file]);
	return (results[0]?.messages ?? []).map((message) => message.ruleId ?? "unknown");
};

describe("lint behaviour against fixtures", () => {
	it("flags a class via functional/no-classes", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "class-fixture.ts");
		expect(ids).toContain("functional/no-classes");
	});

	it("flags a throw via functional/no-throw-statements", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "throw-fixture.ts");
		expect(ids).toContain("functional/no-throw-statements");
	});

	it("flags a discarded promise via the typed no-floating-promises (projectService proof)", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "floating-fixture.ts");
		expect(ids).toContain("@typescript-eslint/no-floating-promises");
	});

	it("snake_case preset accepts create_thing and rejects createThing", async () => {
		const results = await create_runner("snake_case").lintFiles(["naming-fixture.ts"]);
		const naming_messages = (results[0]?.messages ?? []).filter(
			(message) => message.ruleId === "@typescript-eslint/naming-convention",
		);
		expect(naming_messages).toHaveLength(1);
		expect(naming_messages[0]?.message).toContain("createThing");
	});

	it("flags a discarded Result via f0rbit/must-use-result through the full factory config", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "result-fixture.ts");
		expect(ids).toContain("f0rbit/must-use-result");
	});

	it("accepts explicit default type args at boundaries (Result<T, CorpusError> annotations stay legal)", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "boundary-annotation-fixture.ts");
		expect(ids).toEqual([]);
	});

	it("accepts awaitless async provider methods implementing Promise-returning interfaces", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "provider-await-fixture.ts");
		expect(ids).toEqual([]);
	});

	it("camelCase preset accepts createThing and rejects create_thing", async () => {
		const results = await create_runner("camelCase").lintFiles(["naming-fixture.ts"]);
		const naming_messages = (results[0]?.messages ?? []).filter(
			(message) => message.ruleId === "@typescript-eslint/naming-convention",
		);
		expect(naming_messages).toHaveLength(1);
		expect(naming_messages[0]?.message).toContain("create_thing");
	});

	// Regression coverage for gap 1 (0.1.4): the const-variable selector used to
	// hardcode snake_case/UPPER_CASE regardless of preset, false-flagging
	// idiomatic camelCase locals like variantClasses under the camelCase preset.
	it("camelCase preset accepts a camelCase const like variantClasses", async () => {
		const results = await create_runner("camelCase").lintFiles(["const-variable-fixture.ts"]);
		const naming_messages = (results[0]?.messages ?? []).filter(
			(message) => message.ruleId === "@typescript-eslint/naming-convention",
		);
		expect(naming_messages.some((message) => message.message.includes("variantClasses"))).toBe(false);
		expect(naming_messages.some((message) => message.message.includes("snake_case_const"))).toBe(true);
	});

	it("snake_case preset still flags a camelCase const like variantClasses", async () => {
		const results = await create_runner("snake_case").lintFiles(["const-variable-fixture.ts"]);
		const naming_messages = (results[0]?.messages ?? []).filter(
			(message) => message.ruleId === "@typescript-eslint/naming-convention",
		);
		expect(naming_messages.some((message) => message.message.includes("variantClasses"))).toBe(true);
		expect(naming_messages.some((message) => message.message.includes("snake_case_const"))).toBe(false);
	});

	// Regression coverage for gap 2 (0.1.4): PascalCase is the JSX/TSX component
	// convention (functions AND const components) and must be legal in .tsx
	// under both presets, but must NOT leak into plain .ts.
	it("tsx carve-out: PascalCase function, const-function, and const components are clean under both presets", async () => {
		for (const naming of ["snake_case", "camelCase"] as const) {
			const ids = await rule_ids(create_runner(naming), "component-fixture.tsx");
			expect(ids.filter((id) => id === "@typescript-eslint/naming-convention")).toEqual([]);
		}
	});

	it("tsx carve-out does not leak into plain .ts — the same PascalCase names are flagged", async () => {
		for (const naming of ["snake_case", "camelCase"] as const) {
			const ids = await rule_ids(create_runner(naming), "component-plain-fixture.ts");
			expect(ids.filter((id) => id === "@typescript-eslint/naming-convention").length).toBeGreaterThan(0);
		}
	});

	// Regression coverage for gap 3 (0.1.4): the default "node-esm" module
	// resolution must keep requiring explicit extensions on relative imports
	// (unchanged corpus/vault/pulse behaviour); "bundler" must allow the
	// extensionless imports tsup/Vite-resolved packages write by convention.
	it("default (node-esm) module_resolution flags an extensionless relative import", async () => {
		const ids = await rule_ids(create_runner("snake_case"), "import-fixture.ts");
		expect(ids).toContain("import-x/extensions");
	});

	it("bundler module_resolution accepts the same extensionless relative import", async () => {
		const ids = await rule_ids(create_runner("snake_case", "bundler"), "import-fixture.ts");
		expect(ids).not.toContain("import-x/extensions");
	});
});
