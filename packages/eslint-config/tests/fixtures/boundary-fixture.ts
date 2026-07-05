// Should flag: JSON.parse output cast straight to a concrete type without a
// Zod parse in between, via f0rbit/require-schema-at-boundary.
type Config = { name: string };

declare function get_raw(): string;

const config = JSON.parse(get_raw()) as Config;

export { config };
