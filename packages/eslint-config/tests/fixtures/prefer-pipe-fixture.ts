type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const parse = (): Result<number, string> => ({ ok: true, value: 1 });
const double = (value: number): Result<number, string> => ({ ok: true, value: value * 2 });

function run(): number | Result<number, string> {
	const a = parse();
	if (!a.ok) return a;
	const b = double(a.value);
	if (!b.ok) return b;
	return b.value;
}

run();
