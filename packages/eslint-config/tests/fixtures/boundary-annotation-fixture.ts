type CorpusError = { kind: "not_found" } | { kind: "storage_read" };
type Result<T, E = CorpusError> = { ok: true; value: T } | { ok: false; error: E };

export function find_thing(id: string): Result<string, CorpusError> {
	if (id === "") return { ok: false, error: { kind: "not_found" } };
	return { ok: true, value: id };
}
