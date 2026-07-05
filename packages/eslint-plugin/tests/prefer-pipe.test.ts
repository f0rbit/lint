import { afterAll, describe, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearCaches } from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { prefer_pipe } from "../src/rules/prefer-pipe.js";

clearCaches();

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = (name, fn) => {
	it.only(name, fn);
};

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

const chain = (count: number): { messageId: "prefer_pipe"; data: { count: string } } => ({
	messageId: "prefer_pipe",
	data: { count: String(count) },
});

rule_tester.run("prefer-pipe", prefer_pipe, {
	valid: [
		{
			name: "single unwrap never reports",
			code: with_decls(`
				function single() {
					const a = get_result();
					if (!a.ok) return a;
					return a.value;
				}
			`),
		},
		{
			name: "two unwraps in different functions do not chain",
			code: with_decls(`
				function first() {
					const a = get_result();
					if (!a.ok) return a;
					return a.value;
				}
				function second() {
					const b = get_result();
					if (!b.ok) return b;
					return b.value;
				}
			`),
		},
		{
			name: "two guards separated by two intervening statements do not chain",
			code: with_decls(`
				function separated() {
					const a = get_result();
					if (!a.ok) return a;
					log(1);
					const b = get_result();
					if (!b.ok) return b;
					return b.value;
				}
			`),
		},
		{
			name: "guard returning a different identifier does not count, so no chain forms",
			code: with_decls(`
				function mismatched() {
					const a = get_result();
					const b = get_result();
					if (!a.ok) return b;
					if (!b.ok) return b;
					return b.value;
				}
			`),
		},
		{
			name: "a non-Result union guard adjacent to a real guard still counts as only one guard",
			code: with_decls(`
				function look_alike_adjacent() {
					const a = get_look_alike();
					if (!a.ok) return a;
					const b = get_result();
					if (!b.ok) return b;
					return b.value;
				}
			`),
		},
		{
			name: "x.ok === true early-return shape is a success check, not an unwrap guard",
			code: with_decls(`
				function success_checks() {
					const a = get_result();
					if (a.ok === true) return a;
					const b = get_result();
					if (b.ok === true) return b;
					return 0;
				}
			`),
		},
	],
	invalid: [
		{
			name: "classic two-guard chain reports once, on the first guard",
			code: with_decls(`
				function classic() {
					const a = get_result();
					if (!a.ok) return a;
					const b = get_result_from(a.value);
					if (!b.ok) return b;
					return b.value;
				}
			`),
			errors: [chain(2)],
		},
		{
			name: "three-guard chain still reports exactly once",
			code: with_decls(`
				function three_deep() {
					const a = get_result();
					if (!a.ok) return a;
					const b = get_result();
					if (!b.ok) return b;
					const c = get_result();
					if (!c.ok) return c;
					return c.value;
				}
			`),
			errors: [chain(3)],
		},
		{
			name: "x.ok === false variant chains the same as !x.ok",
			code: with_decls(`
				function explicit_false() {
					const a = get_result();
					if (a.ok === false) return a;
					const b = get_result();
					if (b.ok === false) return b;
					return b.value;
				}
			`),
			errors: [chain(2)],
		},
		{
			name: "async function with awaited Results still chains",
			code: with_decls(`
				async function two_awaited() {
					const a = await get_result_promise();
					if (!a.ok) return a;
					const b = await get_result_promise();
					if (!b.ok) return b;
					return b.value;
				}
			`),
			errors: [chain(2)],
		},
	],
});
