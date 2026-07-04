export type NamingPreset = "snake_case" | "camelCase";

type NamingSelector = {
	readonly selector: string | readonly string[];
	readonly format: readonly string[] | null;
	readonly types?: readonly string[];
	readonly modifiers?: readonly string[];
	readonly leadingUnderscore?: "allow";
};

const function_formats: Record<NamingPreset, readonly string[]> = {
	snake_case: ["snake_case"],
	camelCase: ["camelCase"],
};

// The const-variable format must derive from the preset too — a hardcoded
// snake_case/UPPER_CASE here false-flags idiomatic camelCase locals
// (variantClasses, etc.) under the camelCase preset.
const const_variable_formats: Record<NamingPreset, readonly string[]> = {
	snake_case: ["snake_case", "UPPER_CASE"],
	camelCase: ["camelCase", "UPPER_CASE"],
};

export function naming_convention_selectors(preset: NamingPreset): readonly NamingSelector[] {
	const function_format = function_formats[preset];
	return [
		{ selector: "import", format: null },
		{ selector: "objectLiteralProperty", format: null },
		{ selector: "typeProperty", format: null },
		{ selector: ["objectLiteralMethod", "typeMethod"], format: null },
		{ selector: "variable", modifiers: ["destructured"], format: null },
		{ selector: "variable", types: ["function"], format: function_format },
		{ selector: "variable", modifiers: ["const"], format: const_variable_formats[preset] },
		{ selector: "variable", format: ["snake_case"] },
		{ selector: "function", format: function_format },
		{ selector: "parameter", format: ["snake_case"], leadingUnderscore: "allow" },
		{ selector: "typeLike", format: ["PascalCase"] },
	];
}

// A selector governs a component's identifier if it's the plain "function"
// selector, or a "variable" selector keyed off either the const modifier or
// the function type — naming-convention picks exactly one matching selector
// per identifier, ranked by a modifier/type weight (type weight dominates),
// so an arrow-function const resolves through the types:["function"] entry
// while a non-function const resolves through the modifiers:["const"] entry.
const is_component_selector = (selector: NamingSelector): boolean => {
	if (selector.selector === "function") return true;
	if (selector.selector !== "variable") return false;
	return Boolean(selector.modifiers?.includes("const")) || Boolean(selector.types?.includes("function"));
};

// JSX/TSX component convention transcends the repo naming preset: PascalCase
// functions and const components (Button, Card, ...) are the ecosystem norm.
// Callers scope this to files: ["**/*.tsx"] — plain .ts stays on the base list.
export function naming_convention_selectors_for_components(preset: NamingPreset): readonly NamingSelector[] {
	return naming_convention_selectors(preset).map((selector) => {
		if (selector.format === null || !is_component_selector(selector)) return selector;
		return { ...selector, format: [...selector.format, "PascalCase"] };
	});
}
