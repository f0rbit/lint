import { AST_NODE_TYPES, TSESLint, type TSESTree } from "@typescript-eslint/utils";
import type { Scope } from "@typescript-eslint/utils/ts-eslint";

// Resolves an identifier reference through ESLint scope analysis. Returns
// undefined when the identifier has no declaration anywhere in scope (an
// implicit / environment global, e.g. an un-shadowed `Date`).
export const resolve_reference = (scope: Scope.Scope, node: TSESTree.Identifier): Scope.Variable | undefined => {
	const reference = scope.references.find((ref) => ref.identifier === node);
	return reference?.resolved ?? undefined;
};

// True when `node` is NOT shadowed by any local declaration — either
// unresolved entirely, or resolved to a variable with zero declarations (a
// pure environment-global binding with no user def, e.g. a configured
// `globals: { Date: "readonly" }` entry).
export const is_unshadowed_global = (scope: Scope.Scope, node: TSESTree.Identifier): boolean => {
	const resolved = resolve_reference(scope, node);
	return !resolved || resolved.defs.length === 0;
};

// The single import specifier that introduced `variable`, when it was bound
// by a named import from `module_source` — undefined for locals, aliases of
// other modules, default/namespace imports, or unresolved globals.
export const imported_from = (variable: Scope.Variable | undefined, module_source: string): string | undefined => {
	const def = variable?.defs[0];
	if (!def || def.type !== TSESLint.Scope.DefinitionType.ImportBinding) return undefined;
	if (def.node.type !== AST_NODE_TYPES.ImportSpecifier) return undefined;
	if (def.parent.type !== AST_NODE_TYPES.ImportDeclaration) return undefined;
	if (def.parent.source.value !== module_source) return undefined;
	const imported = def.node.imported;
	return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
};
