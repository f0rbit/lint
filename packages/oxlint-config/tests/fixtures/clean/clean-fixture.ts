export function shallow_sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
