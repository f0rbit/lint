# @f0rbit/eslint-plugin

Custom typed org rules for the f0rbit ecosystem. Consumed through `@f0rbit/eslint-config`'s `define_lint_config` factory under the `f0rbit` namespace — consumers never install this package directly.

## Rules

Heading text below is the bare rule name — it's the exact anchor fragment `ESLintUtils.RuleCreator`'s doc-URL builder points at (`.../packages/eslint-plugin#<name>`), so don't add prefixes or suffixes to these headings.

### must-use-result

**Rule ID:** `f0rbit/must-use-result` · **Tier:** error · **Type-aware:** yes · **Since:** 0.1.0

Flags a statement that discards a call returning a `Result` — a discarded `Result` is a silently swallowed error.

Detection is **structural**, not name-based: any union where every non-nullish member carries an `ok` boolean-literal discriminant, with a `{ ok: true; value }` arm and a `{ ok: false; error }` arm, counts as a Result. This matches corpus's local `Result`, `@f0rbit/corpus`'s export, and any structurally-identical homegrown copy. `Promise<Result>` is unwrapped via the checker's awaited type, so both `await f();` and a floating `f();` are caught.

```ts
get_result();              // error — discarded
await get_result_async();  // error — awaited then discarded
void get_result();         // error — void still hides the error arm
get_result_async();        // error — floating Promise<Result>

const result = get_result();       // ok — assigned
return get_result();               // ok — returned
take(get_result());                // ok — passed along
if (get_result().ok) { ... }       // ok — inspected
```

Intentional discards are config-scoped, not comment-scoped: use a `files`-scoped override in the consumer's `eslint.config.ts`, or a described `eslint-disable-next-line f0rbit/must-use-result -- reason`.

**Fire-and-forget convention:** the `void` operator is the sanctioned marker for intentionally discarding a Promise that cannot be awaited. Bare floating promises stay flagged by `@typescript-eslint/no-floating-promises`; once wrapped in `void`, the promise rejection is the callee's responsibility to handle internally. This is a **Promise-only** convention — it does not extend to `Result`: `void get_result();` above is still an error, because `must-use-result` deliberately peels the `void` operator before checking. A `Result`'s error arm can never be fire-and-forgotten; only a Promise's resolution can.

```ts
void emit_telemetry(); // ok — intentional fire-and-forget, marked with void
emit_telemetry(); // error — floating Promise flagged by no-floating-promises
await emit_telemetry(); // ok — awaited
const _ = emit_telemetry(); // ok — assigned (though void is clearer for pure side-effects)
```

### prefer-pipe

**Rule ID:** `f0rbit/prefer-pipe` · **Tier:** warn (graduating) · **Type-aware:** yes · **Since:** 0.2.0

Flags two or more consecutive manual Result-unwrap guards in the same statement list — an unwrap guard is an `if` statement testing `!x.ok` or `x.ok === false` whose body is exactly `return x;`, where `x`'s type is a Result. Two guards separated by at most one intervening statement (typically the next step's declaration) form a run; a run of length ≥ 2 reports once, on its first guard. A single unwrap never reports — this rule is about the _repeated_ boilerplate, not the guard shape itself.

```ts
// warn (1 report, on the first guard) — 2 consecutive manual unwraps
const a = get_a();
if (!a.ok) return a;
const b = get_b(a.value);
if (!b.ok) return b;
return ok(b.value);

// ok — compose with pipe() instead
return pipe(get_a(), (a) => get_b(a.value));

// ok — a single unwrap never reports
const a = get_a();
if (!a.ok) return a;
return ok(a.value);
```

No autofix or suggestions — the message names `pipe()` and points at the corpus-patterns recipe; exemptions are config-scoped `files`-scoped overrides in the consumer's `eslint.config.ts` (no factory option).

### no-ambient-effects

**Rule ID:** `f0rbit/no-ambient-effects` · **Tier:** warn (graduating) · **Type-aware:** no (syntactic) · **Since:** 0.2.0

Flags ambient reads of time and randomness that make code untestable against in-memory providers: `Date.now()`, `new Date()` called with zero arguments, and `Math.random()`. Detection is scope-resolved, not name-matched — `Date`/`Math` only flag when they resolve to the global (via ESLint scope analysis); a local shadow (an injected clock/rng provider) never flags.

```ts
// warn — ambient clock/rng read
const created_at = Date.now();
const roll = Math.random();
const now = new Date();

// ok — new Date(x) with an argument is not an ambient "now" read
const parsed = new Date(timestamp);

// ok — Date resolves to the injected local, not the global
function handler(Date: ClockProvider) {
	const created_at = Date.now();
}
```

Sanctioned alternative: inject a clock/rng provider (a Result-returning `ClockProvider`/`RngProvider` interface with an in-memory fake for tests) instead of reading the ambient global directly. The exemption is a **factory option**, not a files-scoped override — designate the files where an ambient read is the point (the one adapter that reads the real clock/rng before handing it to injected consumers):

```ts
define_lint_config({
	...,
	ambient_effect_files: ["src/providers/**"], // f0rbit/no-ambient-effects: off for these files
});
```

### no-test-mocks

**Rule ID:** `f0rbit/no-test-mocks` · **Tier:** error · **Type-aware:** no (syntactic) · **Since:** 0.2.0

Flags `mock`/`spyOn`/`jest` imported from `bun:test` (on the import specifier) and their resolved usages (on the call), plus the bare global `jest.fn/mock/spyOn/mocked()` convenience surface when `jest` has no import or local declaration at all. The testing-strategy convention is in-memory fakes (the Provider pattern) over mocking framework internals — a mock hides the contract behind a stub; a fake is a real, inspectable implementation.

Detection is binding-resolved via ESLint scope analysis, not name-matched: a locally-defined `mock` function, or `mock`/`spyOn` imported from anywhere other than `bun:test`, never flags — including through an alias (`import { mock as m } from "bun:test"` flags both the import and every resolved usage of `m`).

```ts
// error — mock/spyOn imported from bun:test, plus their usage
import { mock, spyOn } from "bun:test";
const send = mock(() => Promise.resolve());
const spy = spyOn(logger, "warn");

// error — bare jest.* convenience global (flags even with no import)
jest.spyOn(logger, "warn");

// ok — in-memory fake instead
class FakeLogger implements Logger {
	warnings: string[] = [];
	warn(message: string) {
		this.warnings.push(message);
	}
}

// ok — a locally-defined mock, or one imported from elsewhere, is not bun:test's
function mock() {
	return "not a test double";
}
```

vitest's `vi` equivalents are out of scope this wave (bun test only — no vitest in the ecosystem). No factory option: exemptions are the standard config-scoped `files`-scoped override in the consumer's `eslint.config.ts`.

### require-schema-at-boundary

**Rule ID:** `f0rbit/require-schema-at-boundary` · **Tier:** error · **Type-aware:** yes · **Since:** 0.3.0 — not part of the 0.2.0 release.

Flags raw external data flowing through the codebase without a Zod parse. Sources (v1): `JSON.parse(...)` where `JSON` resolves to the global (a local shadow doesn't count), and `.json()` calls on a receiver that's structurally fetch-`Body`-like (has `json`, `text`, and `headers` members — covers lib.dom `Response`/`Request`, undici, `@cloudflare/workers-types`, and framework wrappers like Hono's `HonoRequest`). D1/Drizzle rows, R2 body reads, and `KV.get(..., "json")` are **not** sources in v1 (phase-in candidates once the JSON/fetch sources have proven false-positive-free).

A boundary expression is sanctioned once it flows into a Zod `.parse()`/`.safeParse()`/`.parseAsync()`/`.safeParseAsync()` call (structurally ZodType-like — any custom validator exposing both `parse` and `safeParse` counts), or into a slot explicitly typed `unknown`. Everything else — member access, destructuring, an `as T` cast (including `as unknown as T`, peeling the `unknown` layer before judging the outer cast) — is a violation. Variable tracking is single-hop: assigning a raw boundary variable onward is itself a violation, not a second hop to re-check.

```ts
// error (unvalidated_boundary) — JSON.parse output used without validation
const data = JSON.parse(raw);
console.log(data.user.name);

// error (cast_boundary) — casting a fetch response straight through
const body = (await response.json()) as User;

// ok — validated at the boundary
const user = UserSchema.parse(JSON.parse(raw));

// ok — explicitly typed unknown, validation deferred downstream
const raw_body: unknown = await response.json();
```

No factory option: exemptions are config-scoped `files`-scoped overrides only.

---

## Adding a rule

One file per rule under `src/rules/`, created with `ESLintUtils.RuleCreator`, exported through `src/index.ts`, wired into the factory in `@f0rbit/eslint-config`, and covered by a `@typescript-eslint/rule-tester` suite under `tests/`.
