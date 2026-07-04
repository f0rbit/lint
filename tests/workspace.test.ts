import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const packages_dir = join(import.meta.dirname, "..", "packages");
const tmp_root = join(import.meta.dirname, ".tmp");

type Manifest = { name: string; version: string; dependencies?: Record<string, string> };

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
const pack = async (package_name: string): Promise<Manifest> => {
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
	return JSON.parse(manifest_json) as Manifest;
};

const sibling_deps = (manifest: Manifest): [string, string][] =>
	Object.entries(manifest.dependencies ?? {}).filter(([name]) => name.startsWith("@f0rbit/"));

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
			const deps = sibling_deps(await pack("lint"));
			expect(deps.length).toBeGreaterThan(0);
			for (const [name, dep_version] of deps) expect(`${name}@${dep_version}`).toBe(`${name}@${version}`);
		}, 15_000);

		it("eslint-config's packed sibling dependencies match the lockstep version", async () => {
			const version = lockstep_version();
			const deps = sibling_deps(await pack("eslint-config"));
			expect(deps.length).toBeGreaterThan(0);
			for (const [name, dep_version] of deps) expect(`${name}@${dep_version}`).toBe(`${name}@${version}`);
		}, 15_000);
	});
});
