import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

export const nullish_flags = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

export const boolean_literal_name = (checker: ts.TypeChecker, type: ts.Type): "true" | "false" | undefined => {
	if ((type.flags & ts.TypeFlags.BooleanLiteral) === 0) return undefined;
	return checker.typeToString(type) === "true" ? "true" : "false";
};

export const has_property = (checker: ts.TypeChecker, type: ts.Type, name: string): boolean =>
	checker.getPropertyOfType(type, name) !== undefined;

export const is_result_type = (checker: ts.TypeChecker, type: ts.Type): boolean => {
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

export const peel_to_call = (expression: TSESTree.Expression): TSESTree.CallExpression | undefined => {
	if (expression.type === AST_NODE_TYPES.CallExpression) return expression;
	if (expression.type === AST_NODE_TYPES.AwaitExpression) return peel_to_call(expression.argument);
	if (expression.type === AST_NODE_TYPES.ChainExpression) return peel_to_call(expression.expression);
	if (expression.type === AST_NODE_TYPES.UnaryExpression && expression.operator === "void") {
		return peel_to_call(expression.argument);
	}
	return undefined;
};
