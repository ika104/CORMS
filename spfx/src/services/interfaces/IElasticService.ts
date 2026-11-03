export interface IElasticSearchResult<T> {
  total: number;
  items: T[];
}

export interface IElasticService {
  search<T>(index: string, query: string): Promise<IElasticSearchResult<T>>;
}
