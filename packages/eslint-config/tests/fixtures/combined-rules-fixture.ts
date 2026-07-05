// Exercises every phase-1 and phase-2 org_rules addition simultaneously through
// one define_lint_config() output — proves org_rules wiring and de-dupe ordering
// hold when prefer-pipe, no-ambient-effects, no-test-mocks, require-schema-at-boundary,
// consistent-type-definitions, and no-console are all active at once, not just
// individually.
import { mock } from "bun:test";

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
type Config = { label: string };

declare function get_raw(): string;

const parse = (): Result<number, string> => ({ ok: true, value: 1 });
const double = (value: number): Result<number, string> => ({ ok: true, value: value * 2 });

// f0rbit/prefer-pipe — two consecutive manual unwrap guards
function run(): number | Result<number, string> {
	const a = parse();
	if (!a.ok) return a;
	const b = double(a.value);
	if (!b.ok) return b;
	return b.value;
}

// f0rbit/no-ambient-effects — ambient clock/rng reads
const created_at = Date.now();
const roll = Math.random();

// f0rbit/no-test-mocks — mock imported from bun:test, then used
const send = mock(() => Promise.resolve());

// consistent-type-definitions — interface instead of a type alias
interface NamedConfig {
	name: string;
}

// f0rbit/require-schema-at-boundary — casting a raw JSON.parse boundary read
const config = JSON.parse(get_raw()) as Config;

// no-console — banned output
console.log("combined fixture", created_at, roll, send, run(), config);

export type { NamedConfig };
