export interface ICacheService {
  get<T>(namespace: string, key: string): T | undefined;
  set<T>(namespace: string, key: string, value: T): void;
  invalidate(namespace: string, key?: string): void;
}
