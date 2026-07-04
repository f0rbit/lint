# @f0rbit/eslint-plugin

Custom typed org rules for the f0rbit ecosystem. Consumed through `@f0rbit/eslint-config`'s `define_lint_config` factory under the `f0rbit` namespace — consumers never install this package directly.

## Rules

### `f0rbit/must-use-result`

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

## Adding a rule

One file per rule under `src/rules/`, created with `ESLintUtils.RuleCreator`, exported through `src/index.ts`, wired into the factory in `@f0rbit/eslint-config`, and covered by a `@typescript-eslint/rule-tester` suite under `tests/`.
