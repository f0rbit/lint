import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const config_path = join(import.meta.dirname, "..", "oxfmtrc.json");
const fixtures_dir = join(import.meta.dirname, "fixtures");

const run_check = async (target: string): Promise<number> => {
	const proc = Bun.spawn(["bunx", "oxfmt", "-c", config_path, "--check", target], {
		cwd: fixtures_dir,
		stdout: "pipe",
		stderr: "pipe",
	});
	return proc.exited;
};

describe("oxfmt config fixtures", () => {
	it("rejects a misformatted fixture in check mode", async () => {
		expect(await run_check("messy/messy-fixture.ts")).toBe(1);
	});

	it("accepts a canonically formatted fixture", async () => {
		expect(await run_check("clean/clean-fixture.ts")).toBe(0);
	});

	it("encodes tabs and print width 120 — not silently left on defaults", async () => {
		const config = (await Bun.file(config_path).json()) as { useTabs: boolean; printWidth: number };
		expect(config.useTabs).toBe(true);
		expect(config.printWidth).toBe(120);
	});
});
