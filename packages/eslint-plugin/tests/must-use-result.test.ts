import { afterAll, describe, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearCaches } from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { must_use_result } from "../src/rules/must-use-result.js";

clearCaches();

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixtures_dir = join(import.meta.dirname, "fixtures");
const decls = readFileSync(join(fixtures_dir, "result-decls.ts"), "utf8");

const with_decls = (code: string): string => `${decls}\n${code}`;

const rule_tester = new RuleTester({
	languageOptions: {
		parserOptions: {
			projectService: { allowDefaultProject: ["*.ts"] },
			tsconfigRootDir: fixtures_dir,
		},
	},
});

const discarded = { messageId: "discarded_result" } as const;

rule_tester.run("must-use-result", must_use_result, {
	valid: [
		{ name: "assigned to a variable", code: with_decls("const result = get_result();") },
		{ name: "assigned after await", code: with_decls("const result = await get_result_promise();") },
		{ name: "returned from a function", code: with_decls("function pass() { return get_result(); }") },
		{ name: "arrow implicit return", code: with_decls("const pass = () => get_result();") },
		{ name: "passed as an argument", code: with_decls("take(get_result());") },
		{ name: "passed to a logger", code: with_decls("log(get_result());") },
		{ name: "spread into an array literal", code: with_decls("const list = [get_result()];") },
		{ name: "placed in an object literal", code: with_decls("const boxed = { result: get_result() };") },
		{ name: "ok destructured", code: with_decls("const { ok } = get_result();") },
		{ name: "member access on the call result", code: with_decls("if (get_result().ok) { log(1); }") },
		{
			name: "awaited member access inside a condition",
			code: with_decls("if ((await get_result_promise()).ok) { log(1); }"),
		},
		{ name: "non-Result call in statement position", code: with_decls("get_number();") },
		{ name: "void-returning call in statement position", code: with_decls("log(42);") },
		{ name: "near-miss union without literal ok discriminant", code: with_decls("get_look_alike();") },
		{ name: "union without an error arm", code: with_decls("get_ok_only();") },
	],
	invalid: [
		{ name: "bare discarded call", code: with_decls("get_result();"), errors: [discarded] },
		{ name: "awaited discarded call", code: with_decls("await get_result_promise();"), errors: [discarded] },
		{ name: "void-discarded call", code: with_decls("void get_result();"), errors: [discarded] },
		{
			name: "void-discarded awaited call",
			code: with_decls("void (await get_result_promise());"),
			errors: [discarded],
		},
		{
			name: "un-awaited Promise<Result> discarded",
			code: with_decls("get_result_promise();"),
			errors: [discarded],
		},
		{ name: "generic alias instantiation discarded", code: with_decls("fetch_user();"), errors: [discarded] },
		{
			name: "nullable Result union discarded",
			code: with_decls("get_optional_result();"),
			errors: [discarded],
		},
		{ name: "optional-chained call discarded", code: with_decls("get_result_maybe?.();"), errors: [discarded] },
	],
});
