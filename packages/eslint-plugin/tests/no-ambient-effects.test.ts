import { afterAll, describe, it } from "bun:test";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { no_ambient_effects } from "../src/rules/no-ambient-effects.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = (name, fn) => {
	it.only(name, fn);
};

const rule_tester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2024,
		sourceType: "module",
		globals: {},
	},
});

const ambient_effect_date_now = { messageId: "ambient_effect", data: { what: "Date.now()" } } as const;
const ambient_effect_new_date = { messageId: "ambient_effect", data: { what: "new Date()" } } as const;
const ambient_effect_math_random = { messageId: "ambient_effect", data: { what: "Math.random()" } } as const;

rule_tester.run("no-ambient-effects", no_ambient_effects, {
	valid: [
		{ name: "new Date with argument", code: "new Date(1234567890);" },
		{ name: "new Date with string", code: "new Date('2024-01-01');" },
		{ name: "Date property access without call", code: "const x = Date.prototype;" },
		{ name: "performance.now()", code: "performance.now();" },
		{ name: "Math.floor", code: "Math.floor(3.14);" },
		{ name: "Math.abs", code: "Math.abs(-5);" },
		{ name: "other clock methods", code: "performance.timing.navigationStart;" },
		{ name: "shadowed Date.now() (local const)", code: "const Date = { now: () => 0 }; Date.now();" },
		{ name: "shadowed new Date() (local const)", code: "class Date {} new Date();" },
		{
			name: "shadowed Math.random() (function param)",
			code: "function f(Math: { random: () => number }) { Math.random(); }",
		},
	],
	invalid: [
		{ name: "bare Date.now()", code: "Date.now();", errors: [ambient_effect_date_now] },
		{ name: "assigned Date.now()", code: "const x = Date.now();", errors: [ambient_effect_date_now] },
		{ name: "in condition", code: "if (Date.now() > 1000) {}", errors: [ambient_effect_date_now] },
		{ name: "bare new Date()", code: "new Date();", errors: [ambient_effect_new_date] },
		{ name: "assigned new Date()", code: "const now = new Date();", errors: [ambient_effect_new_date] },
		{ name: "bare Math.random()", code: "Math.random();", errors: [ambient_effect_math_random] },
		{ name: "assigned Math.random()", code: "const coin = Math.random();", errors: [ambient_effect_math_random] },
		{
			name: "in array",
			code: "[Date.now(), Math.random(), new Date()]",
			errors: [ambient_effect_date_now, ambient_effect_math_random, ambient_effect_new_date],
		},
	],
});
