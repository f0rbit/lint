import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packages_dir = join(import.meta.dirname, "..", "packages");
const tmp_root = join(import.meta.dirname, ".tmp");

type Manifest = { name: string; version: string; dependencies?: Record<string, string> };
type Packed = { manifest: Manifest; tarball: string };

const workspace_packages = ["lint", "eslint-config", "eslint-plugin", "oxfmt-config", "oxlint-config"] as const;
type WorkspacePackage = (typeof workspace_packages)[number];
type Tarballs = Record<WorkspacePackage, string>;

const read_manifests = (): Manifest[] => {
	if (!existsSync(packages_dir)) return [];
	return readdirSync(packages_dir)
		.map((entry) => join(packages_dir, entry, "package.json"))
		.filter((path) => existsSync(path))
		.map((path) => JSON.parse(readFileSync(path, "utf8")) as Manifest);
};

const lockstep_version = (): string => {
	const versions = [...new Set(read_manifests().map((manifest) => manifest.version))];
	if (versions.length !== 1) throw new Error(`expected exactly one lockstep version, found ${versions.join(", ")}`);
	const [version] = versions;
	if (version === undefined) throw new Error("unreachable: lockstep version missing after length check");
	return version;
};

// `bun pm pack` rewrites a packed manifest's `workspace:*` deps to a concrete
// version pulled from bun.lock's cached per-workspace-package version — NOT
// from re-reading the sibling's package.json at pack time. If bun.lock ever
// goes stale relative to package.json (see AGENTS.md), the packed tarball
// silently ships wrong sibling versions. Pack for real and inspect the
// tarball rather than trusting the source manifests.
const pack = async (package_name: string): Promise<Packed> => {
	const dest = join(tmp_root, package_name);
	rmSync(dest, { recursive: true, force: true });
	mkdirSync(dest, { recursive: true });
	const pack_proc = Bun.spawn(["bun", "pm", "pack", "--quiet", "--destination", dest], {
		cwd: join(packages_dir, package_name),
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(pack_proc.stdout).text();
	if ((await pack_proc.exited) !== 0) {
		throw new Error(`bun pm pack failed for ${package_name}: ${await new Response(pack_proc.stderr).text()}`);
	}
	// bun pm pack --quiet emits a leading blank line inside workspaces — take
	// the last non-empty line, same defensive read the release workflow uses.
	const tarball = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.at(-1);
	if (!tarball) throw new Error(`bun pm pack produced no tarball path for ${package_name}`);
	const cat_proc = Bun.spawn(["tar", "-xzO", "-f", tarball, "package/package.json"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const manifest_json = await new Response(cat_proc.stdout).text();
	if ((await cat_proc.exited) !== 0) {
		throw new Error(`tar extraction failed for ${package_name}: ${await new Response(cat_proc.stderr).text()}`);
	}
	return { manifest: JSON.parse(manifest_json) as Manifest, tarball };
};

const pack_all = async (): Promise<Tarballs> => {
	const entries = await Promise.all(
		workspace_packages.map(async (name) => [name, (await pack(name)).tarball] as const),
	);
	return Object.fromEntries(entries) as Tarballs;
};

const sibling_deps = (manifest: Manifest): [string, string][] =>
	Object.entries(manifest.dependencies ?? {}).filter(([name]) => name.startsWith("@f0rbit/"));

const overrides_for = (tarballs: Tarballs): Record<string, string> => ({
	"@f0rbit/eslint-config": `file:${tarballs["eslint-config"]}`,
	"@f0rbit/eslint-plugin": `file:${tarballs["eslint-plugin"]}`,
	"@f0rbit/oxfmt-config": `file:${tarballs["oxfmt-config"]}`,
	"@f0rbit/oxlint-config": `file:${tarballs["oxlint-config"]}`,
});

// Builds a throwaway consumer that installs ONLY the packed umbrella (plus its
// own typescript pin), per the "Consumer-simulation recipe" gotcha in
// AGENTS.md: overrides point the umbrella's sibling deps at their own
// tarballs since the packed manifest references the lockstep version, which
// doesn't exist on npm until this is published. `@types/bun` mirrors what any
// real bun-based consumer (corpus, devpad, ...) already carries as its own
// devDependency — without it, "types": ["bun"] can't resolve and
// typescript-eslint's default project (which parses eslint.config.ts itself)
// flags `import.meta.dirname` as error-typed.
const write_consumer = (name: string, typescript_version: string, tarballs: Tarballs): string => {
	const dir = join(tmp_root, name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(join(dir, "src"), { recursive: true });
	const manifest = {
		name,
		private: true,
		devDependencies: {
			"@f0rbit/lint": `file:${tarballs.lint}`,
			"@types/bun": "1.3.14",
			typescript: typescript_version,
		},
		overrides: overrides_for(tarballs),
	};
	writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	writeFileSync(join(dir, "bunfig.toml"), '[install]\nlinker = "hoisted"\n');
	writeFileSync(
		join(dir, "tsconfig.json"),
		`${JSON.stringify(
			{
				compilerOptions: {
					strict: true,
					target: "ESNext",
					module: "NodeNext",
					moduleResolution: "NodeNext",
					skipLibCheck: true,
					noEmit: true,
					types: ["bun"],
				},
				// src/**, not **/*.ts: eslint.config.ts must stay OUT of the project
				// so typescript-eslint's allowDefaultProject handles it instead (see
				// AGENTS.md — a file can't be in both).
				include: ["src/**/*.ts"],
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(
		join(dir, "eslint.config.ts"),
		'import { define_lint_config } from "@f0rbit/lint";\n\nexport default define_lint_config({\n\tnaming: "snake_case",\n\ttsconfig_root_dir: import.meta.dirname,\n});\n',
	);
	writeFileSync(join(dir, "src", "index.ts"), "export const trivial_value = 42;\n");
	return dir;
};

const run = async (cmd: string[], cwd: string): Promise<{ exit_code: number; stdout: string; stderr: string }> => {
	const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exit_code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exit_code, stdout, stderr };
};

const installed_typescript_version = (consumer_dir: string): string =>
	(JSON.parse(readFileSync(join(consumer_dir, "node_modules", "typescript", "package.json"), "utf8")) as Manifest)
		.version;

afterAll(() => {
	rmSync(tmp_root, { recursive: true, force: true });
});

describe("workspace", () => {
	it("all packages share one lockstep version", () => {
		const versions = new Set(read_manifests().map((manifest) => manifest.version));
		expect(versions.size).toBeLessThanOrEqual(1);
	});

	it("all packages are scoped under @f0rbit", () => {
		const names = read_manifests().map((manifest) => manifest.name);
		for (const name of names) expect(name).toStartWith("@f0rbit/");
	});

	describe("packed tarballs", () => {
		it("umbrella's packed sibling dependencies match the lockstep version", async () => {
			const version = lockstep_version();
			const deps = sibling_deps((await pack("lint")).manifest);
			expect(deps.length).toBeGreaterThan(0);
			for (const [name, dep_version] of deps) expect(`${name}@${dep_version}`).toBe(`${name}@${version}`);
		}, 15_000);

		it("eslint-config's packed sibling dependencies match the lockstep version", async () => {
			const version = lockstep_version();
			const deps = sibling_deps((await pack("eslint-config")).manifest);
			expect(deps.length).toBeGreaterThan(0);
			for (const [name, dep_version] of deps) expect(`${name}@${dep_version}`).toBe(`${name}@${version}`);
		}, 15_000);
	});

	// Proves the tightened `typescript` peer range (>=4.8.4 <6.1.0, mirroring
	// typescript-eslint's own declared range) still admits both a TS5 consumer
	// and devpad's real TS6.0.3 pin, and that a real `bun install` + `eslint`
	// run against the packed (unpublished) umbrella succeeds end to end.
	describe("consumer install simulation", () => {
		let tarballs: Tarballs;

		beforeAll(async () => {
			tarballs = await pack_all();
		}, 60_000);

		it("a TS5 consumer installs against the tightened peer range and passes typed linting", async () => {
			const dir = write_consumer("consumer-ts5", "^5.6.0", tarballs);
			const install = await run(["bun", "install"], dir);
			expect(install.exit_code).toBe(0);
			expect(installed_typescript_version(dir).startsWith("5.")).toBe(true);
			const lint = await run(["./node_modules/.bin/eslint", "."], dir);
			expect(lint.exit_code).toBe(0);
		}, 120_000);

		it("a TS6.0.3 consumer (devpad's real pin) installs against the tightened peer range and passes typed linting", async () => {
			const dir = write_consumer("consumer-ts6", "6.0.3", tarballs);
			const install = await run(["bun", "install"], dir);
			expect(install.exit_code).toBe(0);
			expect(installed_typescript_version(dir)).toBe("6.0.3");
			const lint = await run(["./node_modules/.bin/eslint", "."], dir);
			expect(lint.exit_code).toBe(0);
		}, 120_000);
	});
});
