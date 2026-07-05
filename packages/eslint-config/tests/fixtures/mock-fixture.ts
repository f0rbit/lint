import { mock, spyOn } from "bun:test";

const mocked_fn = mock(() => {
	return "value";
});

const spy = spyOn({}, "method");

jest.fn();
jest.mock("module");
jest.spyOn(object, "method");
