import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const config_path = join(import.meta.dirname, "..", "oxlintrc.json");
const fixtures_dir = join(import.meta.dirname, "fixtures");

type Diagnostic = { code: string; severity: string };
type OxlintReport = { diagnostics: Diagnostic[] };

const run_oxlint = async (target: string): Promise<{ codes: string[]; exit_code: number }> => {
	const proc = Bun.spawn(["bunx", "oxlint", "-c", config_path, "-f", "json", target], {
		cwd: fixtures_dir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const raw = await new Response(proc.stdout).text();
	const exit_code = await proc.exited;
	const report = JSON.parse(raw) as OxlintReport;
	return { codes: report.diagnostics.map((diagnostic) => diagnostic.code), exit_code };
};

describe("oxlint config fixtures", () => {
	it("flags the bad fixture with every expected rule", async () => {
		const { codes, exit_code } = await run_oxlint("bad/BadFixture.ts");
		expect(exit_code).toBe(1);
		const expected = [
			"unicorn(filename-case)",
			"typescript(no-explicit-any)",
			"typescript(no-non-null-assertion)",
			"eslint(max-depth)",
			"eslint(no-else-return)",
		];
		for (const code of expected) expect(codes).toContain(code);
	});

	it("reports zero diagnostics on the clean fixture", async () => {
		const { codes, exit_code } = await run_oxlint("clean/clean-fixture.ts");
		expect(exit_code).toBe(0);
		expect(codes).toEqual([]);
	});

	it("parses as a valid config for the pinned oxlint (unknown rules would fail every run)", async () => {
		const { exit_code } = await run_oxlint("clean/clean-fixture.ts");
		expect(exit_code).toBe(0);
	});
});
