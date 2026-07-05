// Should flag console.log, console.warn, console.info
console.log("debug message");
console.warn("warning message");
console.info("info message");

// console.error is also flagged
console.error("error message");

export function example() {
	// Even in functions
	console.log("nested");
}
