import * as React from 'react';
import { ViewMode, GRID_PAGE_SIZES, GRID_DEFAULT_PAGE_SIZE } from './types';
import { useServices } from '../../services/ServiceProvider';

const CACHE_NAMESPACE = 'corms.grid';

export interface GridControllerState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  pageSizeOptions: readonly number[];
}

export function useGridController(options: {
  gridId?: string;
  defaultViewMode?: ViewMode;
  enableViewToggle?: boolean;
  pageSizeOptions?: number[];
}): GridControllerState {
  const { cacheService } = useServices();
  const {
    gridId,
    defaultViewMode = 'cards',
    enableViewToggle = true,
    pageSizeOptions = GRID_PAGE_SIZES,
  } = options;

  const viewModeCacheKey = gridId ? `viewMode:${gridId}` : undefined;

  const [viewMode, setViewModeState] = React.useState<ViewMode>(() => {
    if (!enableViewToggle) return defaultViewMode;
    if (viewModeCacheKey) {
      const cached = cacheService.get<ViewMode>(CACHE_NAMESPACE, viewModeCacheKey);
      if (cached === 'table' || cached === 'cards') return cached;
    }
    return defaultViewMode;
  });

  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSizeState] = React.useState(
    pageSizeOptions.indexOf(GRID_DEFAULT_PAGE_SIZE) !== -1
      ? GRID_DEFAULT_PAGE_SIZE
      : (pageSizeOptions[0] ?? GRID_DEFAULT_PAGE_SIZE)
  );

  const setViewMode = React.useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      if (viewModeCacheKey) {
        cacheService.set(CACHE_NAMESPACE, viewModeCacheKey, mode);
      }
    },
    [cacheService, viewModeCacheKey]
  );

  const setPageSize = React.useCallback((size: number) => {
    setPageSizeState(size);
    setPage(0);
  }, []);

  return {
    viewMode,
    setViewMode,
    page,
    pageSize,
    setPage,
    setPageSize,
    pageSizeOptions,
  };
}
