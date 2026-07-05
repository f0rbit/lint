import type { TSESLint } from "@typescript-eslint/utils";
import type { ESLint } from "eslint";
import { must_use_result } from "./rules/must-use-result.js";
import { prefer_pipe } from "./rules/prefer-pipe.js";
import { no_ambient_effects } from "./rules/no-ambient-effects.js";
import { no_test_mocks } from "./rules/no-test-mocks.js";
import { require_schema_at_boundary } from "./rules/require-schema-at-boundary.js";

const typed_plugin = {
	meta: { name: "@f0rbit/eslint-plugin", version: "0.2.0" },
	rules: {
		"must-use-result": must_use_result,
		"prefer-pipe": prefer_pipe,
		"no-ambient-effects": no_ambient_effects,
		"no-test-mocks": no_test_mocks,
		"require-schema-at-boundary": require_schema_at_boundary,
	},
} satisfies TSESLint.FlatConfig.Plugin;

// Boundary cast: typescript-eslint rule contexts are not structurally assignable to
// eslint core's RuleDefinition (tseslint drops deprecated context members). Same cast
// typescript-eslint ships in its own plugin export; runtime shapes are compatible.
export const plugin = typed_plugin as unknown as ESLint.Plugin;

export default plugin;
