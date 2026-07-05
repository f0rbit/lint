import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import { is_unshadowed_global } from "./shared/scope.js";

type RuleDocs = { requiresTypeChecking: boolean };

const create_rule = ESLintUtils.RuleCreator<RuleDocs>(
	(name) => `https://github.com/f0rbit/lint/tree/main/packages/eslint-plugin#${name}`,
);

export const no_ambient_effects = create_rule({
	name: "no-ambient-effects",
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Flag ambient reads of time/randomness (Date.now, new Date(), Math.random) that make code untestable against in-memory providers",
			requiresTypeChecking: false,
		},
		messages: {
			ambient_effect:
				"Ambient {{what}} makes this untestable — inject a clock/rng provider, or move this into a designated ambient-effect file (factory option ambient_effect_files).",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		// A local `const Date = ...` or `const Math = ...` resolves the
		// identifier to that declaration instead of the ambient global — scope
		// resolution (not name-matching) is what makes shadowing work.
		const is_global_base = (node: TSESTree.Identifier): boolean =>
			is_unshadowed_global(context.sourceCode.getScope(node), node);

		return {
			CallExpression(node: TSESTree.CallExpression): void {
				if (
					node.callee.type === AST_NODE_TYPES.MemberExpression &&
					!node.callee.computed &&
					node.callee.object.type === AST_NODE_TYPES.Identifier &&
					node.callee.property.type === AST_NODE_TYPES.Identifier
				) {
					const base = node.callee.object;
					const member = node.callee.property.name;
					if (base.name === "Date" && member === "now" && is_global_base(base)) {
						context.report({ node, messageId: "ambient_effect", data: { what: "Date.now()" } });
					}
					if (base.name === "Math" && member === "random" && is_global_base(base)) {
						context.report({ node, messageId: "ambient_effect", data: { what: "Math.random()" } });
					}
				}
			},

			NewExpression(node: TSESTree.NewExpression): void {
				if (
					node.callee.type === AST_NODE_TYPES.Identifier &&
					node.callee.name === "Date" &&
					node.arguments.length === 0 &&
					is_global_base(node.callee)
				) {
					context.report({ node, messageId: "ambient_effect", data: { what: "new Date()" } });
				}
			},
		};
	},
});
