import { z } from "zod";

const UserSchema = z.object({ name: z.string() });

// Structurally ZodType-like without actually being zod — the receiver check
// is version-agnostic and must accept any custom validator shaped this way.
const custom_validator = {
	parse: (input: unknown): { name: string } => ({ name: String(input) }),
	safeParse: (input: unknown): { success: boolean } => ({ success: input !== undefined }),
};

// Has a `parse` method, but no `safeParse` — must NOT be treated as a
// validator (structural ZodType detection requires both).
const number_like = {
	parse: (input: string): number => Number(input),
};

type Config = { name: string };

declare function get_raw(): string;
declare function ingest(input: unknown): void;
declare function ingest_typed(input: Config): void;
declare function log(value: unknown): void;

declare const response: Response;
declare const response_maybe: Response | undefined;

// fetch-Body-like receivers (json + text + headers) vs. lookalikes missing
// one or more of the three members.
declare const json_only: { json(): unknown };
declare const json_and_text: { json(): unknown; text(): Promise<string> };

// Generic-default-unknown shape (corpus's Observation<T = unknown>): the
// `content` property's contextual type is `unknown` only through the
// enclosing return-type annotation's generic default, not a direct
// annotation on the property value itself.
type WithContent<T = unknown> = { id: string; content: T };
declare function base_fields(): { id: string };
declare function get_content_raw(): string;

// Result-style higher-order helper (pulse/corpus's `try_catch`): the
// callback's return type is only `unknown` through the CALLER's explicit
// generic instantiation, not an annotation on the callback itself.
declare function try_catch<T, E>(
	fn: () => T,
	on_error: (e: unknown) => E,
): { ok: true; value: T } | { ok: false; error: E };
