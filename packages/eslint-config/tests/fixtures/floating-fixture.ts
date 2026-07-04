async function do_work(): Promise<number> {
	return 1;
}

export function fire_and_forget(): void {
	do_work();
}
