import { expect, test } from "vitest";

import { buildSearchPreview } from "./search-preview";

test("builds a heading for the parsed query", () => {
  const preview = buildSearchPreview("  Example Query ");
  expect(preview.heading).toBe('Search preview for "example query"');
});

test("lists result titles in ranked order", () => {
  const preview = buildSearchPreview("example");
  expect(preview.resultTitles).toStrictEqual(["Second sample result", "First sample result"]);
});
