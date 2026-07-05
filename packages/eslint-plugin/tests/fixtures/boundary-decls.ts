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
