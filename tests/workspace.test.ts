import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const packages_dir = join(import.meta.dirname, "..", "packages");

type Manifest = { name: string; version: string };

const read_manifests = (): Manifest[] => {
	if (!existsSync(packages_dir)) return [];
	return readdirSync(packages_dir)
		.map((entry) => join(packages_dir, entry, "package.json"))
		.filter((path) => existsSync(path))
		.map((path) => JSON.parse(readFileSync(path, "utf8")) as Manifest);
};

describe("workspace", () => {
	it("all packages share one lockstep version", () => {
		const versions = new Set(read_manifests().map((manifest) => manifest.version));
		expect(versions.size).toBeLessThanOrEqual(1);
	});

	it("all packages are scoped under @f0rbit", () => {
		const names = read_manifests().map((manifest) => manifest.name);
		for (const name of names) expect(name).toStartWith("@f0rbit/");
	});
});
