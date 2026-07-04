type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const make_result = (): Result<number, string> => ({ ok: true, value: 1 });

make_result();
