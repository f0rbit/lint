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

export function naming_convention_selectors(preset: NamingPreset): readonly NamingSelector[] {
	const function_format = function_formats[preset];
	return [
		{ selector: "import", format: null },
		{ selector: "objectLiteralProperty", format: null },
		{ selector: "typeProperty", format: null },
		{ selector: ["objectLiteralMethod", "typeMethod"], format: null },
		{ selector: "variable", modifiers: ["destructured"], format: null },
		{ selector: "variable", types: ["function"], format: function_format },
		{ selector: "variable", modifiers: ["const"], format: ["snake_case", "UPPER_CASE"] },
		{ selector: "variable", format: ["snake_case"] },
		{ selector: "function", format: function_format },
		{ selector: "parameter", format: ["snake_case"], leadingUnderscore: "allow" },
		{ selector: "typeLike", format: ["PascalCase"] },
	];
}
