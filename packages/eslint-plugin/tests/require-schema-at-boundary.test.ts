import { afterAll, describe, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearCaches } from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { require_schema_at_boundary } from "../src/rules/require-schema-at-boundary.js";

clearCaches();

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = (name, fn) => {
	it.only(name, fn);
};

const fixtures_dir = join(import.meta.dirname, "fixtures");
const decls = readFileSync(join(fixtures_dir, "boundary-decls.ts"), "utf8");

const with_decls = (code: string): string => `${decls}\n${code}`;

const rule_tester = new RuleTester({
	languageOptions: {
		parserOptions: {
			projectService: { allowDefaultProject: ["*.ts"] },
			tsconfigRootDir: fixtures_dir,
		},
	},
});

const unvalidated = { messageId: "unvalidated_boundary" } as const;
const cast = { messageId: "cast_boundary" } as const;

rule_tester.run("require-schema-at-boundary", require_schema_at_boundary, {
	valid: [
		{ name: "schema.parse(JSON.parse(...))", code: with_decls("UserSchema.parse(JSON.parse(get_raw()));") },
		{
			name: "schema.safeParse(await res.json())",
			code: with_decls("UserSchema.safeParse(await response.json());"),
		},
		{
			name: "declared unknown, then narrowed via zod",
			code: with_decls("const raw: unknown = JSON.parse(get_raw());\nif (UserSchema.safeParse(raw).success) log(raw);"),
		},
		{
			name: "await res.json() passed to a declared-unknown parameter",
			code: with_decls("ingest(await response.json());"),
		},
		{
			name: "JSON.parse on a shadowed local JSON does not flag",
			code: with_decls("const JSON = { parse: (input: string): string => input };\nJSON.parse(get_raw()).length;"),
		},
		{
			name: ".json() on a non-Body receiver (json only) is not a source",
			code: with_decls("json_only.json();"),
		},
		{
			name: ".json() on a non-Body receiver (json + text, no headers) is not a source",
			code: with_decls("json_and_text.json();"),
		},
		{ name: "z.string().parse(...) receiver variant", code: with_decls("z.string().parse(JSON.parse(get_raw()));") },
		{ name: "schema.parseAsync(...)", code: with_decls("UserSchema.parseAsync(JSON.parse(get_raw()));") },
		{ name: "schema.safeParseAsync(...)", code: with_decls("UserSchema.safeParseAsync(JSON.parse(get_raw()));") },
		{
			name: "optional-chained .json() source flowing directly into a zod sink",
			code: with_decls("UserSchema.safeParse(await response_maybe?.json());"),
		},
		{
			name: "async function with a declared Promise<unknown> return",
			code: with_decls("async function load_raw(): Promise<unknown> {\n\treturn JSON.parse(get_raw());\n}"),
		},
		{
			name: "arrow function with an implicit unknown return",
			code: with_decls("const load_unknown = (): unknown => JSON.parse(get_raw());"),
		},
		{
			name: "object-literal property with a declared-unknown contextual type (generic default T = unknown)",
			code: with_decls(
				"function to_record(): WithContent {\n\treturn { ...base_fields(), content: JSON.parse(get_content_raw()) };\n}",
			),
		},
		{
			name: "unannotated arrow callback contextually constrained to unknown via the caller's explicit generic argument",
			code: with_decls("try_catch<unknown, null>(() => JSON.parse(get_raw()), () => null);"),
		},
		{
			name: "custom (non-zod) validator exposing parse and safeParse is accepted",
			code: with_decls("custom_validator.parse(JSON.parse(get_raw()));"),
		},
	],
	invalid: [
		{
			name: "JSON.parse(...).foo member access",
			code: with_decls("JSON.parse(get_raw()).foo;"),
			errors: [unvalidated],
		},
		{
			name: "(await res.json()).items member access",
			code: with_decls("(await response.json()).items;"),
			errors: [unvalidated],
		},
		{
			name: "JSON.parse(...) as Config cast",
			code: with_decls("JSON.parse(get_raw()) as Config;"),
			errors: [cast],
		},
		{
			name: "JSON.parse(...) as unknown as Config double cast",
			code: with_decls("JSON.parse(get_raw()) as unknown as Config;"),
			errors: [cast],
		},
		{
			name: "single-hop: un-annotated variable then member access",
			code: with_decls("const data = JSON.parse(get_raw());\ndata.foo;"),
			errors: [unvalidated],
		},
		{
			name: "single-hop: destructuring a tracked raw variable",
			code: with_decls("const data = JSON.parse(get_raw());\nconst { value } = data;"),
			errors: [unvalidated],
		},
		{
			name: "typed return leaks raw data",
			code: with_decls("function load_config(): Config {\n\tconst data = JSON.parse(get_raw());\n\treturn data;\n}"),
			errors: [unvalidated],
		},
		{
			name: "onward re-assignment to another un-annotated variable (no transitive hop)",
			code: with_decls("const a = JSON.parse(get_raw());\nconst b = a;"),
			errors: [unvalidated],
		},
		{
			name: "destructuring directly off the boundary call",
			code: with_decls("const { name } = JSON.parse(get_raw());"),
			errors: [unvalidated],
		},
		{
			name: "passing to a non-unknown typed parameter",
			code: with_decls("ingest_typed(JSON.parse(get_raw()));"),
			errors: [unvalidated],
		},
		{
			name: "a receiver with parse but not safeParse is not treated as a validator",
			code: with_decls("number_like.parse(JSON.parse(get_raw()));"),
			errors: [unvalidated],
		},
		{
			name: "JSON.parse(JSON.stringify(x)) deep-clone idiom still flags",
			code: with_decls("const cloned = JSON.parse(JSON.stringify(get_raw()));\ncloned.value;"),
			errors: [unvalidated],
		},
		{
			name: "optional-chained .json() source tracked through a raw variable",
			code: with_decls("const maybe_data = await response_maybe?.json();\nmaybe_data.foo;"),
			errors: [unvalidated],
		},
		{
			name: "object-literal property with a non-unknown contextual type still flags",
			code: with_decls(
				"function to_typed_record(): WithContent<Config> {\n\treturn { ...base_fields(), content: JSON.parse(get_content_raw()) };\n}",
			),
			errors: [unvalidated],
		},
		{
			name: "unannotated arrow callback with a non-unknown contextual type still flags",
			code: with_decls("try_catch<Config, null>(() => JSON.parse(get_raw()), () => null);"),
			errors: [unvalidated],
		},
	],
});
