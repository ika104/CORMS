import * as React from 'react';

export type ViewMode = 'table' | 'cards';

export interface DataGridColumn<T> {
  field: keyof T & string;
  headerKey: string;
  filter?: 'text' | 'number' | 'date' | false;
  filterParams?: Record<string, unknown>;
  sortable?: boolean;
  /** Initial sort direction applied to this column when the grid first renders (the user can still
   * re-sort). Use on exactly one column; e.g. the audit grids sort newest-first by `seq` desc. */
  initialSort?: 'asc' | 'desc';
  width?: number;
  minWidth?: number;
  flex?: number;
  pinned?: 'left' | 'right';
  cellRenderer?: (row: T) => React.ReactNode;
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  loading?: boolean;
  onRefresh: () => void;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  defaultViewMode?: ViewMode;
  enableViewToggle?: boolean;
  /** `selectionControl` is the row's selection checkbox (only passed for a selectable grid) — place
   * it inside the card (e.g. CorrespondenceCard's `selectionControl`) so it renders beside the
   * card's actions instead of in a separate row. */
  cardRenderer?: (row: T, selectionControl?: React.ReactNode) => React.ReactNode;
  pageSizeOptions?: number[];
  emptyStateKey?: string;
  gridId?: string;
  toolbarTitle?: string;
  /** Rendered next to the title, before the built-in refresh/view-toggle controls. */
  toolbarLeftActions?: React.ReactNode;
  /** Rendered after refresh, before the view toggle. */
  toolbarRightActions?: React.ReactNode;
  /** Fires whenever the visible (post column-filter/sort) row set changes — for callers that need it outside the grid, e.g. CSV export. */
  onFilteredRowsChange?: (rows: T[]) => void;
  /** Adds a leading checkbox column (table) / per-card checkbox (cards) plus a "select all
   * on this page" control. Selection is owned by the caller (`selectedIds`/`onSelectionChange`)
   * so it survives page changes, the Cards/Table toggle, and caller-driven row-set changes —
   * the grid never clears it on its own. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

// TODO(confirm): page-size options [10, 25, 50, 100] with default 25 — confirm with team/RecordsHub for parity.
export const GRID_PAGE_SIZES = [10, 25, 50, 100] as const;
export const GRID_DEFAULT_PAGE_SIZE = 25;
