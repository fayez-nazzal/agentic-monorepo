import { expect, test } from "vitest";

import { type SearchResult, rankResults } from "./results.js";

test("rankResults orders results by score descending", () => {
  const low: SearchResult = { title: "Low", score: 0.2 };
  const high: SearchResult = { title: "High", score: 0.9 };
  const ranked = rankResults([low, high]);
  expect(ranked[0]).toStrictEqual(high);
  expect(ranked[1]).toStrictEqual(low);
});

test("rankResults leaves the input untouched", () => {
  const low: SearchResult = { title: "Low", score: 0.2 };
  const high: SearchResult = { title: "High", score: 0.9 };
  const input = [low, high];
  rankResults(input);
  expect(input[0]).toStrictEqual(low);
});
