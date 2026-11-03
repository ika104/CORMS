import { ICacheService } from '../interfaces/ICacheService';

// Bumped again for the Provision Lists admin screen (nav.json gained the provisionLists entry) —
// same reasoning as before: this orphans any nav/currentUser snapshot an already-open tab cached
// under the old key, forcing a refetch instead of replaying stale content indefinitely
// (sessionStorage survives reloads within a tab).
// Bump this whenever nav.json or the mock/live identity shape changes, so open tabs pick it up
// without the user needing to manually clear storage.
// Exported so tests can build the expected sessionStorage key without hardcoding the version
// (which changes independently of test intent whenever nav.json/identity shape changes).
export const CACHE_VERSION = 'v4';
const PREFIX = 'corms';

function buildKey(namespace: string, key: string): string {
  return `${PREFIX}:${CACHE_VERSION}:${namespace}:${key}`;
}

export class CacheService implements ICacheService {
  public get<T>(namespace: string, key: string): T | undefined {
    try {
      const raw = sessionStorage.getItem(buildKey(namespace, key));
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  }

  public set<T>(namespace: string, key: string, value: T): void {
    try {
      sessionStorage.setItem(buildKey(namespace, key), JSON.stringify(value));
    } catch {
      // sessionStorage unavailable (e.g. private browsing quota) — fail silently, cache is best-effort.
    }
  }

  public invalidate(namespace: string, key?: string): void {
    if (key) {
      sessionStorage.removeItem(buildKey(namespace, key));
      return;
    }
    const prefix = `${PREFIX}:${CACHE_VERSION}:${namespace}:`;
    Object.keys(sessionStorage)
      .filter((k) => k.indexOf(prefix) === 0)
      .forEach((k) => sessionStorage.removeItem(k));
  }
}
