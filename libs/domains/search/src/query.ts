export type SearchQuery = {
  readonly text: string;
};

export function parseQuery(rawText: string): SearchQuery {
  const text = rawText.trim().toLowerCase();
  return { text };
}
