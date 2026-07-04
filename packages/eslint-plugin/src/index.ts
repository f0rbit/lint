import type { TSESLint } from "@typescript-eslint/utils";
import type { ESLint } from "eslint";
import { must_use_result } from "./rules/must-use-result.js";

const typed_plugin = {
	meta: { name: "@f0rbit/eslint-plugin", version: "0.1.4" },
	rules: { "must-use-result": must_use_result },
} satisfies TSESLint.FlatConfig.Plugin;

// Boundary cast: typescript-eslint rule contexts are not structurally assignable to
// eslint core's RuleDefinition (tseslint drops deprecated context members). Same cast
// typescript-eslint ships in its own plugin export; runtime shapes are compatible.
export const plugin = typed_plugin as unknown as ESLint.Plugin;

export default plugin;
