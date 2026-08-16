import { expect, test } from "vitest";

import { formatSearchReport } from "./search-report.js";

test("starts the report with the parsed query", () => {
  const report = formatSearchReport("  Example Query ");
  const lines = report.split("\n");
  expect(lines[0]).toBe('Search report for "example query"');
});

test("lists results in ranked order", () => {
  const report = formatSearchReport("example");
  const lines = report.split("\n");
  expect(lines[1]).toBe("Second sample result");
  expect(lines[2]).toBe("First sample result");
});
