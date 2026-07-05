import {
	AST_NODE_TYPES,
	ESLintUtils,
	type ParserServicesWithTypeInformation,
	type TSESTree,
} from "@typescript-eslint/utils";
import ts from "typescript";
import { has_property } from "./shared/result-type.js";

type RuleDocs = { requiresTypeChecking: boolean };

const create_rule = ESLintUtils.RuleCreator<RuleDocs>(
	(name) => `https://github.com/f0rbit/lint/tree/main/packages/eslint-plugin#${name}`,
);

const ZOD_METHODS = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);

// Structural ZodType detection: callable `parse` AND `safeParse` members, so
// a lookalike exposing only one (e.g. a `Number.parseInt`-style object) is
// never treated as a validator. Version-agnostic across zod 3 and 4.
const is_callable_member = (checker: ts.TypeChecker, type: ts.Type, name: string): boolean => {
	const symbol = checker.getPropertyOfType(type, name);
	if (!symbol) return false;
	return checker.getTypeOfSymbol(symbol).getCallSignatures().length > 0;
};

const is_zod_receiver = (checker: ts.TypeChecker, type: ts.Type): boolean =>
	is_callable_member(checker, type, "parse") && is_callable_member(checker, type, "safeParse");

// fetch-Body-like: has json/text/headers members. Covers lib.dom
// Response/Request, undici, workers-types, framework wrappers (HonoRequest).
const is_fetch_body_receiver = (checker: ts.TypeChecker, type: ts.Type): boolean =>
	has_property(checker, type, "json") && has_property(checker, type, "text") && has_property(checker, type, "headers");

const is_unknown_type = (type: ts.Type): boolean => (type.flags & ts.TypeFlags.Unknown) !== 0;

// `JSON` resolved via the checker's symbol table, not by name: a local
// shadow (`const JSON = {...}`) resolves to a symbol declared in the user's
// own file, which is never part of TypeScript's bundled default lib.
const is_global_json_parse = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	node: TSESTree.CallExpression,
): boolean => {
	const callee = node.callee;
	if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
	if (callee.property.type !== AST_NODE_TYPES.Identifier || callee.property.name !== "parse") return false;
	if (callee.object.type !== AST_NODE_TYPES.Identifier || callee.object.name !== "JSON") return false;
	const ts_object = services.esTreeNodeToTSNodeMap.get(callee.object);
	const symbol = checker.getSymbolAtLocation(ts_object);
	if (!symbol?.declarations) return false;
	return symbol.declarations.some((decl) => services.program.isSourceFileDefaultLibrary(decl.getSourceFile()));
};

// Optional-chained receivers (`res?.json()`) type as `T | undefined` at the
// object position — strip the nullish arm before the structural check, or a
// property present on every non-nullish member still fails the union lookup.
const receiver_type = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	node: TSESTree.Expression,
): ts.Type => checker.getNonNullableType(services.getTypeAtLocation(node));

const is_fetch_body_json_call = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	node: TSESTree.CallExpression,
): boolean => {
	const callee = node.callee;
	if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
	if (callee.property.type !== AST_NODE_TYPES.Identifier || callee.property.name !== "json") return false;
	return is_fetch_body_receiver(checker, receiver_type(checker, services, callee.object));
};

// Walks up through the transparent wrappers a boundary expression can sit
// under before reaching the point that actually consumes it: await,
// optional-chain, and an `as unknown` widening cast (parens aren't real AST
// nodes under typescript-estree, so there's nothing to peel there).
const peel_transparent = (node: TSESTree.Node): TSESTree.Node => {
	let current = node;
	for (;;) {
		const parent = current.parent;
		if (!parent) return current;
		if (parent.type === AST_NODE_TYPES.AwaitExpression && parent.argument === current) {
			current = parent;
			continue;
		}
		if (parent.type === AST_NODE_TYPES.ChainExpression && parent.expression === current) {
			current = parent;
			continue;
		}
		if (
			parent.type === AST_NODE_TYPES.TSAsExpression &&
			parent.expression === current &&
			parent.typeAnnotation.type === AST_NODE_TYPES.TSUnknownKeyword
		) {
			current = parent;
			continue;
		}
		return current;
	}
};

const is_zod_sink = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	current: TSESTree.Node,
	call: TSESTree.CallExpression,
): boolean => {
	const callee = call.callee;
	if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
	if (callee.property.type !== AST_NODE_TYPES.Identifier || !ZOD_METHODS.has(callee.property.name)) return false;
	if (call.arguments.length !== 1 || call.arguments[0] !== current) return false;
	return is_zod_receiver(checker, receiver_type(checker, services, callee.object));
};

const is_unknown_argument = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	call: TSESTree.CallExpression,
	index: number,
): boolean => {
	const ts_call = services.esTreeNodeToTSNodeMap.get(call);
	const signature = checker.getResolvedSignature(ts_call);
	if (!signature) return false;
	const parameters = signature.getParameters();
	const param = parameters[Math.min(index, parameters.length - 1)];
	if (!param) return false;
	return is_unknown_type(checker.getTypeOfSymbolAtLocation(param, ts_call));
};

const nearest_function = (node: TSESTree.Node): TSESTree.FunctionLike | undefined => {
	let current = node.parent;
	while (current) {
		if (
			current.type === AST_NODE_TYPES.FunctionDeclaration ||
			current.type === AST_NODE_TYPES.FunctionExpression ||
			current.type === AST_NODE_TYPES.ArrowFunctionExpression
		) {
			return current;
		}
		current = current.parent;
	}
	return undefined;
};

const is_unknown_return = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	fn: TSESTree.FunctionLike,
): boolean => {
	const ts_fn = services.esTreeNodeToTSNodeMap.get(fn);
	const [signature] = checker.getTypeAtLocation(ts_fn).getCallSignatures();
	if (!signature) return false;
	const return_type = signature.getReturnType();
	return is_unknown_type(checker.getAwaitedType(return_type) ?? return_type);
};

type Outcome =
	| { readonly tag: "sanctioned" }
	| { readonly tag: "defer"; readonly declarator: TSESTree.VariableDeclarator }
	| {
			readonly tag: "violation";
			readonly messageId: "unvalidated_boundary" | "cast_boundary";
			readonly node: TSESTree.Node;
	  };

const sanctioned: Outcome = { tag: "sanctioned" };

const violation = (node: TSESTree.Node, message_id: "unvalidated_boundary" | "cast_boundary"): Outcome => ({
	tag: "violation",
	messageId: message_id,
	node,
});

// `allow_defer` is only true when judging the boundary call itself — a raw
// variable's onward reference is judged with it false, so re-assigning a raw
// variable to another un-annotated variable is a violation, not a second hop.
const classify_declarator = (
	declarator: TSESTree.VariableDeclarator,
	current: TSESTree.Node,
	allow_defer: boolean,
): Outcome => {
	if (declarator.id.type !== AST_NODE_TYPES.Identifier) return violation(current, "unvalidated_boundary");
	const annotation = declarator.id.typeAnnotation?.typeAnnotation;
	if (annotation) {
		return annotation.type === AST_NODE_TYPES.TSUnknownKeyword
			? sanctioned
			: violation(current, "unvalidated_boundary");
	}
	return allow_defer ? { tag: "defer", declarator } : violation(current, "unvalidated_boundary");
};

const classify_consumption = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	expr: TSESTree.Node,
	allow_defer: boolean,
): Outcome => {
	const current = peel_transparent(expr);
	const parent = current.parent;
	if (!parent) return sanctioned;

	// Any TSAsExpression reaching here is a cast AWAY from unknown (or a cast
	// with no unknown involved at all) — `as unknown` layers were already
	// peeled above, so `as unknown as T` reports on this, the outer cast.
	if (parent.type === AST_NODE_TYPES.TSAsExpression && parent.expression === current) {
		return violation(parent, "cast_boundary");
	}

	if (parent.type === AST_NODE_TYPES.CallExpression) {
		if (is_zod_sink(checker, services, current, parent)) return sanctioned;
		const argument_index = parent.arguments.findIndex((argument) => argument === current);
		if (argument_index !== -1) {
			return is_unknown_argument(checker, services, parent, argument_index)
				? sanctioned
				: violation(current, "unvalidated_boundary");
		}
	}

	if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === current) {
		return classify_declarator(parent, current, allow_defer);
	}

	if (
		(parent.type === AST_NODE_TYPES.ReturnStatement && parent.argument === current) ||
		(parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === current)
	) {
		const fn = parent.type === AST_NODE_TYPES.ArrowFunctionExpression ? parent : nearest_function(parent);
		return fn && is_unknown_return(checker, services, fn) ? sanctioned : violation(current, "unvalidated_boundary");
	}

	return violation(current, "unvalidated_boundary");
};

/**
 * Requires raw boundary data (global `JSON.parse`, fetch-Body-like `.json()`)
 * to flow through a Zod parse or an explicit `unknown` slot before use.
 *
 * Variable tracking is single-hop by design: an un-annotated `const`/`let`
 * initialised from a boundary call becomes a tracked raw variable, and each
 * of its references is judged the same way a direct use would be — but
 * re-assigning a raw variable onward to another un-annotated variable is
 * itself a violation, not a second hop to keep tracking. This keeps the
 * analysis bounded and its false-negative surface honest rather than
 * attempting (and inevitably failing at) a general data-flow analysis.
 *
 * Known evasion surface (accepted, not chased):
 * - Assigning a raw variable via a bare `AssignmentExpression` to a
 *   pre-declared variable (`let y; y = JSON.parse(s);`) is not tracked —
 *   only `VariableDeclarator`-initialised raw variables are.
 * - A raw variable captured by a closure, stored on an object/array, or
 *   passed through a non-`unknown` generic helper is judged once at that
 *   boundary and not followed further.
 * - D1/Drizzle rows, R2 body reads, and `KV.get(..., "json")` are not
 *   sources in v1 (deferred — see the active plan's out-of-scope section).
 */
export const require_schema_at_boundary = create_rule({
	name: "require-schema-at-boundary",
	meta: {
		type: "problem",
		docs: {
			description:
				"Require raw external data (JSON.parse, fetch-Body .json()) to flow through a Zod parse (or an explicit unknown slot) before use",
			requiresTypeChecking: true,
		},
		messages: {
			unvalidated_boundary:
				"Raw data from a JSON.parse/.json() boundary is used without validation — parse it with a Zod schema first (schema.parse(...)), or use structuredClone(...) if this is only a deep clone.",
			cast_boundary:
				"Casting raw boundary data with 'as' skips validation — parse it with a Zod schema first (schema.parse(...)) instead of asserting its shape.",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		const services = ESLintUtils.getParserServices(context);
		const checker = services.program.getTypeChecker();

		const report = (outcome: Outcome): void => {
			if (outcome.tag === "violation") context.report({ node: outcome.node, messageId: outcome.messageId });
		};

		const track_raw_variable = (declarator: TSESTree.VariableDeclarator): void => {
			for (const variable of context.sourceCode.getDeclaredVariables(declarator)) {
				for (const reference of variable.references) {
					if (reference.init || !reference.isRead()) continue;
					report(classify_consumption(checker, services, reference.identifier, false));
				}
			}
		};

		const judge_source = (node: TSESTree.CallExpression): void => {
			const outcome = classify_consumption(checker, services, node, true);
			if (outcome.tag === "defer") track_raw_variable(outcome.declarator);
			else report(outcome);
		};

		return {
			CallExpression(node): void {
				if (is_global_json_parse(checker, services, node) || is_fetch_body_json_call(checker, services, node)) {
					judge_source(node);
				}
			},
		};
	},
});
