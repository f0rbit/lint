export function deeplyNested(value: any): number {
	const forced = value!.length as number;
	if (forced > 0) {
		if (forced > 1) {
			if (forced > 2) {
				if (forced > 3) {
					if (forced > 4) {
						if (forced > 5) {
							return forced;
						}
					}
				}
			}
		}
	}
	if (forced < 0) {
		return -1;
	} else {
		return 0;
	}
}
