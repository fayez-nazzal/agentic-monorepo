export type SearchResult = {
  readonly title: string;
  readonly score: number;
};

export function rankResults(results: readonly SearchResult[]): SearchResult[] {
  const ranked = [...results];
  ranked.sort(byScoreDescending);
  return ranked;
}

function byScoreDescending(first: SearchResult, second: SearchResult): number {
  return second.score - first.score;
}
