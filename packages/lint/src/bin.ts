#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require_from_here = createRequire(import.meta.url);

// literal (not JSON.stringify) so the written stub is already oxfmt-canonical —
// init must not produce files that immediately fail the fmt:check script it installs.
// ignorePatterns live in the stub, not only the extended config: oxlint honours
// ignorePatterns from the root config file only — they do not propagate via extends.
const oxlint_stub = `{
	"extends": ["./node_modules/@f0rbit/oxlint-config/oxlintrc.json"],
	"ignorePatterns": ["**/node_modules/**", "**/dist/**", "**/coverage/**"]
}
`;

const eslint_stub = `import { define_lint_config } from "@f0rbit/lint";

export default define_lint_config({
	naming: "camelCase", // scaffolded-package preset; corpus-style repos use "snake_case"
	tsconfig_root_dir: import.meta.dirname,
	overrides: [],
});
`;

const managed_scripts: Record<string, string> = {
	lint: "oxlint . && eslint .",
	"lint:fix": "oxlint --fix . && eslint --fix .",
	fmt: "oxfmt .",
	"fmt:check": "oxfmt --check .",
};

const canonical_oxfmtrc = (): string =>
	readFileSync(require_from_here.resolve("@f0rbit/oxfmt-config/oxfmtrc.json"), "utf8");

const write_stub = (cwd: string, file: string, content: string, force: boolean): string => {
	const path = join(cwd, file);
	if (existsSync(path) && !force) {
		const unchanged = readFileSync(path, "utf8") === content;
		return unchanged
			? `  = ${file} up to date`
			: `  ! ${file} exists and differs — left untouched (use --force to overwrite)`;
	}
	writeFileSync(path, content);
	return `  + ${file} written`;
};

const merge_scripts = (cwd: string): string[] => {
	const path = join(cwd, "package.json");
	if (!existsSync(path)) return ["  ! package.json not found — scripts not merged"];
	const raw = readFileSync(path, "utf8");
	const manifest = JSON.parse(raw) as { scripts?: Record<string, string> };
	const scripts = manifest.scripts ?? {};
	const notes: string[] = [];
	let changed = false;
	for (const [name, command] of Object.entries(managed_scripts)) {
		const existing = scripts[name];
		if (existing === command) notes.push(`  = script "${name}" up to date`);
		else if (existing !== undefined) notes.push(`  ! script "${name}" already set to "${existing}" — left untouched`);
		else {
			scripts[name] = command;
			changed = true;
			notes.push(`  + script "${name}" added`);
		}
	}
	if (!changed) return notes;
	manifest.scripts = scripts;
	const indent = raw.includes("\n\t") ? "\t" : "  ";
	writeFileSync(path, `${JSON.stringify(manifest, null, indent)}\n`);
	// oxfmt canonicalises package.json key order — format the file we just
	// modified so init never leaves a file behind that fails its own fmt:check
	const fmt = Bun.spawnSync(["bunx", "oxfmt", "package.json"], { cwd });
	if (fmt.exitCode !== 0) notes.push('  ! could not oxfmt package.json — run "bun run fmt" manually');
	return notes;
};

const init = (cwd: string, force: boolean): number => {
	const notes = [
		write_stub(cwd, ".oxlintrc.json", oxlint_stub, force),
		write_stub(cwd, ".oxfmtrc.json", canonical_oxfmtrc(), force),
		write_stub(cwd, "eslint.config.ts", eslint_stub, force),
		...merge_scripts(cwd),
	];
	console.log(["f0rbit-lint init:", ...notes].join("\n"));
	return notes.some((note) => note.startsWith("  !")) ? 1 : 0;
};

const check = (cwd: string): number => {
	const failures: string[] = [];
	const oxfmtrc_path = join(cwd, ".oxfmtrc.json");
	if (!existsSync(oxfmtrc_path)) failures.push(".oxfmtrc.json missing — run f0rbit-lint init");
	else if (readFileSync(oxfmtrc_path, "utf8") !== canonical_oxfmtrc())
		failures.push(
			".oxfmtrc.json drifted from the canonical @f0rbit/oxfmt-config copy — repo-specific format ignores belong in .prettierignore, not here; run f0rbit-lint init --force to restore",
		);
	const oxlintrc_path = join(cwd, ".oxlintrc.json");
	if (!existsSync(oxlintrc_path)) failures.push(".oxlintrc.json missing — run f0rbit-lint init");
	else if (!readFileSync(oxlintrc_path, "utf8").includes("@f0rbit/oxlint-config/oxlintrc.json"))
		failures.push(".oxlintrc.json no longer extends @f0rbit/oxlint-config — restore the extends entry");
	if (failures.length === 0) {
		console.log("f0rbit-lint check: configs match the canonical copies");
		return 0;
	}
	console.error(["f0rbit-lint check failed:", ...failures.map((failure) => `  ✗ ${failure}`)].join("\n"));
	return 1;
};

const [command, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
const cwd = process.cwd();

if (command === "init") process.exit(init(cwd, force));
if (command === "check") process.exit(check(cwd));
console.error("usage: f0rbit-lint <init [--force] | check>");
process.exit(1);
