import { type SearchResult, parseQuery, rankResults } from "@domains/search";

export function formatSearchReport(rawText: string): string {
  const query = parseQuery(rawText);
  const first: SearchResult = { title: "First sample result", score: 0.4 };
  const second: SearchResult = { title: "Second sample result", score: 0.9 };
  const ranked = rankResults([first, second]);
  const titles = ranked.map((result) => resultTitle(result));
  const lines = [`Search report for "${query.text}"`, ...titles];
  return lines.join("\n");
}

function resultTitle(result: SearchResult): string {
  return result.title;
}
