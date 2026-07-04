import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const bin_path = join(import.meta.dirname, "..", "src", "bin.ts");
const canonical_oxfmtrc = readFileSync(join(import.meta.dirname, "..", "..", "oxfmt-config", "oxfmtrc.json"), "utf8");
const tmp_root = join(import.meta.dirname, ".tmp");

afterAll(() => {
	rmSync(tmp_root, { recursive: true, force: true });
});

const make_consumer = (name: string): string => {
	const dir = join(tmp_root, name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "package.json"),
		`${JSON.stringify({ name: "consumer", private: true, scripts: { test: "bun test" } }, null, "\t")}\n`,
	);
	return dir;
};

const run_bin = async (cwd: string, args: string[]): Promise<{ exit_code: number; stdout: string; stderr: string }> => {
	const proc = Bun.spawn(["bun", bin_path, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	const exit_code = await proc.exited;
	return { exit_code, stdout, stderr };
};

describe("f0rbit-lint init", () => {
	it("writes the three stubs and merges scripts without clobbering", async () => {
		const dir = make_consumer("init-basic");
		const { exit_code } = await run_bin(dir, ["init"]);
		expect(exit_code).toBe(0);
		const stub = readFileSync(join(dir, ".oxlintrc.json"), "utf8");
		expect(stub).toContain("./node_modules/@f0rbit/oxlint-config/oxlintrc.json");
		expect(readFileSync(join(dir, ".oxfmtrc.json"), "utf8")).toBe(canonical_oxfmtrc);
		expect(readFileSync(join(dir, "eslint.config.ts"), "utf8")).toContain("define_lint_config");
		const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(manifest.scripts["test"]).toBe("bun test");
		expect(manifest.scripts["lint"]).toBe("oxlint . && eslint .");
		expect(manifest.scripts["fmt:check"]).toBe("oxfmt --check .");
	});

	it("writes stubs that already pass fmt:check", async () => {
		const dir = make_consumer("init-oxfmt-clean");
		await run_bin(dir, ["init"]);
		const proc = Bun.spawn(
			["bunx", "oxfmt", "--check", ".oxlintrc.json", ".oxfmtrc.json", "eslint.config.ts", "package.json"],
			{
				cwd: dir,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		expect(await proc.exited).toBe(0);
	});

	it("is idempotent — a second run changes nothing and exits 0", async () => {
		const dir = make_consumer("init-idempotent");
		await run_bin(dir, ["init"]);
		const snapshot = [".oxlintrc.json", ".oxfmtrc.json", "eslint.config.ts", "package.json"].map((file) =>
			readFileSync(join(dir, file), "utf8"),
		);
		const second = await run_bin(dir, ["init"]);
		expect(second.exit_code).toBe(0);
		const after = [".oxlintrc.json", ".oxfmtrc.json", "eslint.config.ts", "package.json"].map((file) =>
			readFileSync(join(dir, file), "utf8"),
		);
		expect(after).toEqual(snapshot);
	});

	it("refuses to overwrite an edited eslint.config.ts without --force", async () => {
		const dir = make_consumer("init-no-clobber");
		await run_bin(dir, ["init"]);
		const edited = "// consumer edits\nexport default [];\n";
		writeFileSync(join(dir, "eslint.config.ts"), edited);
		const rerun = await run_bin(dir, ["init"]);
		expect(rerun.exit_code).toBe(1);
		expect(readFileSync(join(dir, "eslint.config.ts"), "utf8")).toBe(edited);
		const forced = await run_bin(dir, ["init", "--force"]);
		expect(forced.exit_code).toBe(0);
		expect(readFileSync(join(dir, "eslint.config.ts"), "utf8")).toContain("define_lint_config");
	});
});

describe("f0rbit-lint check", () => {
	it("passes on a pristine init", async () => {
		const dir = make_consumer("check-clean");
		await run_bin(dir, ["init"]);
		const { exit_code } = await run_bin(dir, ["check"]);
		expect(exit_code).toBe(0);
	});

	it("fails when .oxfmtrc.json drifts from the canonical copy", async () => {
		const dir = make_consumer("check-drift");
		await run_bin(dir, ["init"]);
		writeFileSync(join(dir, ".oxfmtrc.json"), `${JSON.stringify({ useTabs: false }, null, "\t")}\n`);
		const { exit_code, stderr } = await run_bin(dir, ["check"]);
		expect(exit_code).toBe(1);
		expect(stderr).toContain("drifted");
	});

	it("fails when the oxlint stub stops extending the shared config", async () => {
		const dir = make_consumer("check-extends");
		await run_bin(dir, ["init"]);
		writeFileSync(join(dir, ".oxlintrc.json"), "{}\n");
		const { exit_code } = await run_bin(dir, ["check"]);
		expect(exit_code).toBe(1);
	});

	it("rejects unknown commands with usage", async () => {
		const dir = make_consumer("usage");
		const { exit_code, stderr } = await run_bin(dir, ["frobnicate"]);
		expect(exit_code).toBe(1);
		expect(stderr).toContain("usage");
	});
});
