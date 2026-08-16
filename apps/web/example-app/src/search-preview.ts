import { type SearchResult, parseQuery, rankResults } from "@domains/search";

export type SearchPreview = {
  readonly heading: string;
  readonly resultTitles: readonly string[];
};

export function buildSearchPreview(rawText: string): SearchPreview {
  const query = parseQuery(rawText);
  const first: SearchResult = { title: "First sample result", score: 0.4 };
  const second: SearchResult = { title: "Second sample result", score: 0.9 };
  const ranked = rankResults([first, second]);
  const resultTitles = ranked.map((result) => resultTitle(result));
  const heading = `Search preview for "${query.text}"`;
  return { heading, resultTitles };
}

function resultTitle(result: SearchResult): string {
  return result.title;
}
