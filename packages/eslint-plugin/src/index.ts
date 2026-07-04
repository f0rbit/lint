import type { TSESLint } from "@typescript-eslint/utils";
import { must_use_result } from "./rules/must-use-result.js";

export const plugin = {
	meta: { name: "@f0rbit/eslint-plugin", version: "0.1.0" },
	rules: { "must-use-result": must_use_result },
} satisfies TSESLint.FlatConfig.Plugin;

export default plugin;
