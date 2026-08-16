import { expect, test } from "vitest";

import { parseQuery } from "./query.js";

test("parseQuery trims and lowercases the text", () => {
  const query = parseQuery("  Hello World  ");
  expect(query.text).toBe("hello world");
});
