import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ESLint } from "eslint";
import { define_lint_config } from "../src/index.js";

const fixtures_dir = join(import.meta.dirname, "fixtures");

const create_runner = (naming: "snake_case" | "camelCase") =>
	new ESLint({
		cwd: fixtures_dir,
		overrideConfigFile: true,
		overrideConfig: define_lint_config({ naming, tsconfig_root_dir: fixtures_dir }),
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

	it("camelCase preset accepts createThing and rejects create_thing", async () => {
		const results = await create_runner("camelCase").lintFiles(["naming-fixture.ts"]);
		const naming_messages = (results[0]?.messages ?? []).filter(
			(message) => message.ruleId === "@typescript-eslint/naming-convention",
		);
		expect(naming_messages).toHaveLength(1);
		expect(naming_messages[0]?.message).toContain("create_thing");
	});
});
