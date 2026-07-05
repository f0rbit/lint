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
const peel_transparent = (node: TSESTree.Expression): TSESTree.Expression => {
	let current = node;
	for (;;) {
		// Every Expression member's `parent` is a non-optional field in
		// typescript-eslint's AST types (only the root Program node has none,
		// and Program isn't part of the Expression union) — no null guard needed.
		const parent = current.parent;
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
	expr: TSESTree.Expression,
	allow_defer: boolean,
): Outcome => {
	const current = peel_transparent(expr);
	// Same non-optional `parent` guarantee as peel_transparent — current is
	// always an Expression here, so this can never be Program's rootless case.
	const parent = current.parent;

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
		// Contextual typing (not the enclosing function's OWN inferred signature)
		// is what actually sanctions this position: an unannotated callback whose
		// return type is only `unknown` via the CALLER's explicit generic
		// instantiation (e.g. `try_catch<unknown, E>(() => JSON.parse(x), ...)`)
		// has its own inferred return type widened to `any` (from JSON.parse),
		// not `unknown` — the checker's contextual type for this exact position
		// is what carries the caller-supplied constraint. This also handles a
		// `return` inside an async function typed `Promise<unknown>` — TS's
		// contextual type for a return-statement argument is already awaited.
		const contextual_type = services.getContextualType(current);
		return contextual_type && is_unknown_type(contextual_type)
			? sanctioned
			: violation(current, "unvalidated_boundary");
	}

	// An object-literal property value (e.g. `{ content: JSON.parse(raw) }`
	// returned from a function typed to return `{ content: unknown }`, such as
	// a generic default `T = unknown`) is a declared-unknown slot exactly like
	// a direct return — TypeScript's own contextual typing already resolves
	// the expected type here, so ask the checker instead of re-deriving it
	// from the enclosing object literal's own consumption.
	if (parent.type === AST_NODE_TYPES.Property && parent.value === current && !parent.computed) {
		const contextual_type = services.getContextualType(current);
		return contextual_type && is_unknown_type(contextual_type)
			? sanctioned
			: violation(current, "unvalidated_boundary");
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
 *
 * An object-literal property value (`{ content: JSON.parse(raw) }`) is
 * sanctioned via `services.getContextualType`, the same as a direct return —
 * this covers a generic default like `content: T = unknown`. Sibling
 * contextual-typing positions (array-literal elements, ternary branches,
 * default parameter values) are not checked; found via the corpus pilot
 * (`observations/storage.ts`'s `row_to_observation`, task 2.2) and scoped
 * narrowly to the exact shape that produced the false positive.
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
					// A reference to a `const`/`let`-declared raw variable is always a
					// plain Identifier — the JSXIdentifier arm of the union is for JSX
					// tag names, which are never variable references.
					if (reference.identifier.type !== AST_NODE_TYPES.Identifier) continue;
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
