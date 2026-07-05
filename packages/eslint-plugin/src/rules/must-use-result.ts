import { ESLintUtils } from "@typescript-eslint/utils";
import { is_result_type, peel_to_call } from "./shared/result-type.js";

type RuleDocs = { requiresTypeChecking: boolean };

const create_rule = ESLintUtils.RuleCreator<RuleDocs>(
	(name) => `https://github.com/f0rbit/lint/tree/main/packages/eslint-plugin#${name}`,
);

export const must_use_result = create_rule({
	name: "must-use-result",
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow discarding a call that returns a Result — a discarded Result is a silently swallowed error",
			requiresTypeChecking: true,
		},
		messages: {
			discarded_result: "Result returned by this call is discarded — assign, return, or handle it.",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		const services = ESLintUtils.getParserServices(context);
		const checker = services.program.getTypeChecker();
		return {
			ExpressionStatement(statement): void {
				const call = peel_to_call(statement.expression);
				if (!call) return;
				const type = services.getTypeAtLocation(call);
				const awaited = checker.getAwaitedType(type) ?? type;
				if (!is_result_type(checker, awaited)) return;
				context.report({ node: call, messageId: "discarded_result" });
			},
		};
	},
});
