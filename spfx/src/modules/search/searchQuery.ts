export interface ISearchQueryPayload {
  term: string;
  filters: Record<string, string>;
}

// TODO(confirm): the live transport (ElasticService.live.ts) POSTs `query` verbatim as an
// Elasticsearch query DSL body — this mock format (plain {term, filters} JSON) is a
// simplified stand-in for that DSL until the real query-builder shape is defined.
export function buildSearchQuery(term: string, filters: Record<string, string>): string {
  return JSON.stringify({ term, filters });
}

export function parseSearchQuery(query: string): ISearchQueryPayload {
  try {
    const parsed = JSON.parse(query) as Partial<ISearchQueryPayload>;
    return { term: parsed.term ?? '', filters: parsed.filters ?? {} };
  } catch {
    return { term: '', filters: {} };
  }
}
