import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

type RuleDocs = { requiresTypeChecking: boolean };

const create_rule = ESLintUtils.RuleCreator<RuleDocs>(
	(name) => `https://github.com/f0rbit/lint/tree/main/packages/eslint-plugin#${name}`,
);

const nullish_flags = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

const boolean_literal_name = (checker: ts.TypeChecker, type: ts.Type): "true" | "false" | undefined => {
	if ((type.flags & ts.TypeFlags.BooleanLiteral) === 0) return undefined;
	return checker.typeToString(type) === "true" ? "true" : "false";
};

const has_property = (checker: ts.TypeChecker, type: ts.Type, name: string): boolean =>
	checker.getPropertyOfType(type, name) !== undefined;

const is_result_type = (checker: ts.TypeChecker, type: ts.Type): boolean => {
	if (!type.isUnion()) return false;
	const members = type.types.filter((member) => (member.flags & nullish_flags) === 0);
	if (members.length < 2) return false;
	let has_ok_arm = false;
	let has_error_arm = false;
	for (const member of members) {
		const ok_symbol = checker.getPropertyOfType(member, "ok");
		if (!ok_symbol) return false;
		const literal = boolean_literal_name(checker, checker.getTypeOfSymbol(ok_symbol));
		if (!literal) return false;
		if (literal === "true" && has_property(checker, member, "value")) has_ok_arm = true;
		if (literal === "false" && has_property(checker, member, "error")) has_error_arm = true;
	}
	return has_ok_arm && has_error_arm;
};

const peel_to_call = (expression: TSESTree.Expression): TSESTree.CallExpression | undefined => {
	if (expression.type === AST_NODE_TYPES.CallExpression) return expression;
	if (expression.type === AST_NODE_TYPES.AwaitExpression) return peel_to_call(expression.argument);
	if (expression.type === AST_NODE_TYPES.ChainExpression) return peel_to_call(expression.expression);
	if (expression.type === AST_NODE_TYPES.UnaryExpression && expression.operator === "void") {
		return peel_to_call(expression.argument);
	}
	return undefined;
};

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
