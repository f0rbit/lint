import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";
import { imported_from, resolve_reference } from "./shared/scope.js";

type RuleDocs = { requiresTypeChecking: boolean };

const create_rule = ESLintUtils.RuleCreator<RuleDocs>(
	(name) => `https://github.com/f0rbit/lint/tree/main/packages/eslint-plugin#${name}`,
);

const BUN_TEST = "bun:test";

export const no_test_mocks = create_rule({
	name: "no-test-mocks",
	meta: {
		type: "problem",
		docs: {
			description: "Disallow importing or using mocks from bun:test or jest — use in-memory fakes instead",
			requiresTypeChecking: false,
		},
		messages: {
			bun_test_mock:
				"Mock imported from bun:test — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			bun_test_spy:
				"spyOn imported from bun:test — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			bun_test_jest:
				"jest imported from bun:test — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			call_mock: "mock() call — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			call_spy: "spyOn() call — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			call_jest_fn:
				"jest.fn() call — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			call_jest_mock:
				"jest.mock() call — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			call_jest_spy:
				"jest.spyOn() call — use in-memory fakes (create a fake implementation of your Provider interface) instead",
			call_jest_mocked:
				"jest.mocked() call — use in-memory fakes (create a fake implementation of your Provider interface) instead",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		return {
			// Import flagging is name-based by design (there's no binding to
			// resolve yet — this IS the declaration site); the local alias plays
			// no part, only the imported name matters.
			ImportDeclaration(node): void {
				if (node.source.value !== BUN_TEST) return;
				for (const spec of node.specifiers) {
					if (spec.type !== AST_NODE_TYPES.ImportSpecifier) continue;
					const name = spec.imported.type === AST_NODE_TYPES.Identifier ? spec.imported.name : spec.imported.value;
					if (name === "mock") context.report({ node: spec, messageId: "bun_test_mock" });
					else if (name === "spyOn") context.report({ node: spec, messageId: "bun_test_spy" });
					else if (name === "jest") context.report({ node: spec, messageId: "bun_test_jest" });
				}
			},

			// Usage flagging is binding-resolved, not name-matched: a locally
			// defined `mock`/`jest` (or one imported from elsewhere) never flags,
			// aliased bun:test imports (`mock as m`) still flag via `m(...)`.
			CallExpression(node): void {
				const callee = node.callee;

				if (callee.type === AST_NODE_TYPES.Identifier) {
					const variable = resolve_reference(context.sourceCode.getScope(callee), callee);
					const source = imported_from(variable, BUN_TEST);
					if (source === "mock") context.report({ node, messageId: "call_mock" });
					else if (source === "spyOn") context.report({ node, messageId: "call_spy" });
					return;
				}

				if (
					callee.type !== AST_NODE_TYPES.MemberExpression ||
					callee.computed ||
					callee.object.type !== AST_NODE_TYPES.Identifier ||
					callee.property.type !== AST_NODE_TYPES.Identifier
				) {
					return;
				}

				const object = callee.object;
				const method = callee.property.name;
				const variable = resolve_reference(context.sourceCode.getScope(object), object);
				const source = imported_from(variable, BUN_TEST);

				// mock.module(...) — usage of the mock binding imported from bun:test.
				if (source === "mock" && method === "module") {
					context.report({ node, messageId: "call_mock" });
					return;
				}

				// jest.fn/mock/spyOn/mocked() — either imported from bun:test, or the
				// trivial global equivalent: `jest` has NO resolved binding at all
				// (a real local/imported `jest`, e.g. `const jest = helper`, always
				// resolves to a variable and is correctly excluded here).
				const is_jest_binding = source === "jest" || (object.name === "jest" && !variable);
				if (!is_jest_binding) return;
				if (method === "fn") context.report({ node, messageId: "call_jest_fn" });
				else if (method === "mock") context.report({ node, messageId: "call_jest_mock" });
				else if (method === "spyOn") context.report({ node, messageId: "call_jest_spy" });
				else if (method === "mocked") context.report({ node, messageId: "call_jest_mocked" });
			},
		};
	},
});
