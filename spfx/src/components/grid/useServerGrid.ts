import * as React from 'react';
import { useServices } from '../../services/ServiceProvider';

export interface IUseServerGridOptions<T> {
  cacheNamespace: string;
  /** Should encode whatever the query depends on (e.g. JSON.stringify(filters)) so a different
   * filter combination never serves another combination's cached rows. */
  cacheKey: string;
  queryFn: () => Promise<T[]>;
  /** Re-fetches whenever any of these change — typically [cacheKey], or the filter object(s) the
   * cacheKey was derived from. */
  deps: React.DependencyList;
  /**
   * Defaults to true. Set false while something the query genuinely depends on is still resolving
   * (e.g. useNav()'s async identity) — no query runs and `loading` stays true, rather than the
   * caller firing a throwaway query with a placeholder value and having to keep its result out of
   * the grid. Include the same condition in `deps` so the real query runs the moment it flips.
   *
   * Deliberately an option rather than "return [] from queryFn": resolving [] would report
   * loading: false and flash the grid's empty state before the real rows arrive.
   */
  enabled?: boolean;
}

export interface IUseServerGridResult<T> {
  rows: T[];
  loading: boolean;
  error: Error | undefined;
  /** Genuinely re-queries (CMS-044 AC6) — invalidates this grid's CacheService entry first, so a
   * stale cached value is never served, then re-runs queryFn(). */
  refresh: () => void;
}

/**
 * One shared server-side data-fetching layer for every grid in this epic (CMS-044) —
 * Inbox/Sent/Drafts today, Audit/Delegation/Registers/Search once their own backend tasks land —
 * so "one consistent grid used everywhere" holds at the data layer, not just visually. Feeds the
 * pre-existing DataGrid component's `rows`/`loading`/`onRefresh` props; DataGrid's own pagination
 * (useGridController) then pages through the already server-filtered/sorted result set entirely
 * client-side (Part 4, option a) — see CorrespondenceListServiceCore's RESULT_CAP comment for why.
 *
 * Deliberately does not short-circuit the initial fetch from cache — the returned rows always
 * reflect a real query for the current `cacheKey`. The cache is only used as a namespaced place
 * to record "this is the last known-good value for this key" (bumped on every successful fetch)
 * so `refresh()` has something concrete to invalidate — never a source of stale data on mount.
 */
export function useServerGrid<T>(options: IUseServerGridOptions<T>): IUseServerGridResult<T> {
  const { cacheService } = useServices();
  const { cacheNamespace, cacheKey, queryFn, enabled = true } = options;
  const [rows, setRows] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | undefined>(undefined);
  // Monotonic request id. Nothing here cancels an in-flight request (there is no abort signal down
  // to PnPjs), so instead every response checks whether a newer one has been started since — an
  // older, slower query can otherwise resolve last and silently overwrite the current one's rows
  // whenever a dep changes mid-flight (tab/folder switches, an identity that resolves late).
  const generationRef = React.useRef(0);

  const fetchRows = React.useCallback((): void => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError(undefined);
    if (!enabled) return;
    queryFn()
      .then((data) => {
        if (generation !== generationRef.current) return;
        setRows(data);
        cacheService.set(cacheNamespace, cacheKey, data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    // deps is caller-supplied and covers everything queryFn closes over; queryFn itself is
    // intentionally excluded so a caller passing a fresh inline function each render doesn't
    // retrigger a fetch on every render.
  }, [cacheService, cacheNamespace, cacheKey, enabled, ...options.deps]);

  React.useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const refresh = React.useCallback((): void => {
    cacheService.invalidate(cacheNamespace, cacheKey);
    fetchRows();
  }, [cacheService, cacheNamespace, cacheKey, fetchRows]);

  return { rows, loading, error, refresh };
}
