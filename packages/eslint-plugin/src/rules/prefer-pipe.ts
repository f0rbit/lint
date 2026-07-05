import {
	AST_NODE_TYPES,
	ESLintUtils,
	type ParserServicesWithTypeInformation,
	type TSESTree,
} from "@typescript-eslint/utils";
import type ts from "typescript";
import { is_result_type } from "./shared/result-type.js";

type RuleDocs = { requiresTypeChecking: boolean };

const create_rule = ESLintUtils.RuleCreator<RuleDocs>(
	(name) => `https://github.com/f0rbit/lint/tree/main/packages/eslint-plugin#${name}`,
);

// At most one intervening statement between two guards for them to chain into
// the same run (index difference of 2 == exactly one statement in between).
const MAX_INDEX_GAP = 2;
const MIN_RUN_LENGTH = 2;

// Program.body is typed as ProgramStatement[] (Statement plus module-level
// declarations); BlockStatement.body is the narrower Statement[]. Statement
// is a subset of ProgramStatement, so using the wider type here lets one set
// of statement-list helpers serve both Program and BlockStatement visitors.
type StatementLike = TSESTree.ProgramStatement;

const match_ok_member = (node: TSESTree.Expression): TSESTree.Identifier | undefined => {
	if (node.type !== AST_NODE_TYPES.MemberExpression) return undefined;
	if (node.computed) return undefined;
	if (node.property.type !== AST_NODE_TYPES.Identifier || node.property.name !== "ok") return undefined;
	return node.object.type === AST_NODE_TYPES.Identifier ? node.object : undefined;
};

const is_false_literal = (node: TSESTree.Expression | TSESTree.PrivateIdentifier): boolean =>
	node.type === AST_NODE_TYPES.Literal && node.value === false;

const as_ok_operand = (node: TSESTree.Expression | TSESTree.PrivateIdentifier): TSESTree.Identifier | undefined =>
	node.type === AST_NODE_TYPES.PrivateIdentifier ? undefined : match_ok_member(node);

// Matches `!x.ok` or `x.ok === false` (either operand order). `x.ok === true`
// deliberately does not match either shape — it is a success check, not an
// unwrap guard.
const guard_test_identifier = (test: TSESTree.Expression): TSESTree.Identifier | undefined => {
	if (test.type === AST_NODE_TYPES.UnaryExpression && test.operator === "!") {
		return match_ok_member(test.argument);
	}
	if (test.type === AST_NODE_TYPES.BinaryExpression && test.operator === "===") {
		const left = as_ok_operand(test.left);
		if (left && is_false_literal(test.right)) return left;
		const right = as_ok_operand(test.right);
		if (right && is_false_literal(test.left)) return right;
	}
	return undefined;
};

const single_return = (block: TSESTree.BlockStatement): TSESTree.ReturnStatement | undefined => {
	if (block.body.length !== 1) return undefined;
	const [only] = block.body;
	return only?.type === AST_NODE_TYPES.ReturnStatement ? only : undefined;
};

const guard_return = (statement: StatementLike): TSESTree.ReturnStatement | undefined => {
	if (statement.type === AST_NODE_TYPES.ReturnStatement) return statement;
	if (statement.type === AST_NODE_TYPES.BlockStatement) return single_return(statement);
	return undefined;
};

const returned_identifier_name = (statement: StatementLike): string | undefined => {
	const ret = guard_return(statement);
	return ret?.argument?.type === AST_NODE_TYPES.Identifier ? ret.argument.name : undefined;
};

type Guard = { readonly node: TSESTree.IfStatement; readonly identifier: TSESTree.Identifier };

// `if (!x.ok) return x;` (bare or single-statement block), no else branch —
// the same identifier must appear in both the test and the return.
const match_guard = (statement: StatementLike): Guard | undefined => {
	if (statement.type !== AST_NODE_TYPES.IfStatement) return undefined;
	if (statement.alternate) return undefined;
	const identifier = guard_test_identifier(statement.test);
	if (!identifier) return undefined;
	if (returned_identifier_name(statement.consequent) !== identifier.name) return undefined;
	return { node: statement, identifier };
};

const is_result_guard = (
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
	identifier: TSESTree.Identifier,
): boolean => {
	const type = services.getTypeAtLocation(identifier);
	const awaited = checker.getAwaitedType(type) ?? type;
	return is_result_type(checker, awaited);
};

type GuardEntry = { readonly index: number; readonly node: TSESTree.IfStatement };

const collect_guards = (
	statements: readonly StatementLike[],
	checker: ts.TypeChecker,
	services: ParserServicesWithTypeInformation,
): GuardEntry[] =>
	statements.reduce<GuardEntry[]>((entries, statement, index) => {
		const guard = match_guard(statement);
		if (!guard || !is_result_guard(checker, services, guard.identifier)) return entries;
		return [...entries, { index, node: guard.node }];
	}, []);

type Run = { readonly first: GuardEntry; readonly last_index: number; readonly length: number };

const extend_runs = (runs: readonly Run[], entry: GuardEntry): readonly Run[] => {
	const current = runs.at(-1);
	if (current && entry.index - current.last_index <= MAX_INDEX_GAP) {
		const extended: Run = { first: current.first, last_index: entry.index, length: current.length + 1 };
		return [...runs.slice(0, -1), extended];
	}
	return [...runs, { first: entry, last_index: entry.index, length: 1 }];
};

const build_runs = (entries: readonly GuardEntry[]): readonly Run[] => entries.reduce<readonly Run[]>(extend_runs, []);

export const prefer_pipe = create_rule({
	name: "prefer-pipe",
	meta: {
		type: "suggestion",
		docs: {
			description: "Prefer pipe() over two or more consecutive manual Result unwrap guards",
			requiresTypeChecking: true,
		},
		messages: {
			prefer_pipe: "{{count}} consecutive manual Result unwraps — compose these steps with pipe() instead.",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		const services = ESLintUtils.getParserServices(context);
		const checker = services.program.getTypeChecker();

		const process_statements = (statements: readonly StatementLike[]): void => {
			const runs = build_runs(collect_guards(statements, checker, services)).filter(
				(run) => run.length >= MIN_RUN_LENGTH,
			);
			for (const run of runs) {
				context.report({ node: run.first.node, messageId: "prefer_pipe", data: { count: String(run.length) } });
			}
		};

		return {
			Program(node): void {
				process_statements(node.body);
			},
			BlockStatement(node): void {
				process_statements(node.body);
			},
		};
	},
});
