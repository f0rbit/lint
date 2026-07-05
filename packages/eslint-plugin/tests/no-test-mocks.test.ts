import { describe, it } from "bun:test";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { no_test_mocks } from "../src/rules/no-test-mocks.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = (name, fn) => {
	it.only(name, fn);
};

const rule_tester = new RuleTester({
	languageOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
	},
});

rule_tester.run("no-test-mocks", no_test_mocks, {
	valid: [
		{ code: "import { describe, it, expect } from 'bun:test';" },
		{ code: "const fake = { send: () => Promise.resolve() };" },
		{ code: "function create_fake_provider() { return {}; }" },
		{ code: "import { mock } from 'other-library';" },
		{ code: "import { spyOn } from 'other-library';" },
		{
			name: "locally-defined mock function, no import — binding-resolved, not name-matched",
			code: "function mock() { return 1; } mock();",
		},
		{
			name: "shadowed jest (local variable, not the bun:test import)",
			code: "const jest = { fn: () => 0 }; jest.fn();",
		},
		{
			name: "bare unresolved mock() with no import at all — no binding proves bun:test origin",
			code: "mock(() => {});",
		},
		{
			name: "mock aliased from another module — usage does not flag",
			code: "import { mock as m } from 'other-library'; m();",
		},
	],
	invalid: [
		{
			name: "import mock from bun:test",
			code: "import { mock } from 'bun:test';",
			errors: [{ messageId: "bun_test_mock" }],
		},
		{
			name: "import spyOn from bun:test",
			code: "import { spyOn } from 'bun:test';",
			errors: [{ messageId: "bun_test_spy" }],
		},
		{
			name: "import jest from bun:test",
			code: "import { jest } from 'bun:test';",
			errors: [{ messageId: "bun_test_jest" }],
		},
		{
			name: "import both mock and spyOn from bun:test",
			code: "import { mock, spyOn } from 'bun:test';",
			errors: [{ messageId: "bun_test_mock" }, { messageId: "bun_test_spy" }],
		},
		{
			name: "import mock and use it",
			code: `import { mock } from 'bun:test';
const m = mock(() => {});`,
			errors: [{ messageId: "bun_test_mock" }, { messageId: "call_mock" }],
		},
		{
			name: "import spyOn and use it",
			code: `import { spyOn } from 'bun:test';
const spy = spyOn(console, 'log');`,
			errors: [{ messageId: "bun_test_spy" }, { messageId: "call_spy" }],
		},
		{
			name: "import jest and use jest.fn()",
			code: `import { jest } from 'bun:test';
const mock_fn = jest.fn();`,
			errors: [{ messageId: "bun_test_jest" }, { messageId: "call_jest_fn" }],
		},
		{
			name: "aliased import mock as m, used as m()",
			code: `import { mock as m } from 'bun:test';
const x = m(() => {});`,
			errors: [{ messageId: "bun_test_mock" }, { messageId: "call_mock" }],
		},
		{
			name: "bare global jest.spyOn() with no import",
			code: "const spy = jest.spyOn(obj, 'method');",
			errors: [{ messageId: "call_jest_spy" }],
		},
		{
			name: "bare global jest.mock() with no import",
			code: "jest.mock('module');",
			errors: [{ messageId: "call_jest_mock" }],
		},
		{
			name: "bare global jest.mocked() with no import",
			code: "const typed = jest.mocked(fn);",
			errors: [{ messageId: "call_jest_mocked" }],
		},
		{
			name: "mock.module() with mock imported from bun:test",
			code: `import { mock } from 'bun:test';
mock.module('fs', () => ({}));`,
			errors: [{ messageId: "bun_test_mock" }, { messageId: "call_mock" }],
		},
	],
});
