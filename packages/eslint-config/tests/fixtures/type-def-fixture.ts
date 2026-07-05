// Should flag an interface and suggest using type alias instead
interface User {
	name: string;
	age: number;
}

// Type alias is fine
type Person = {
	name: string;
	age: number;
};

export { User, Person };
