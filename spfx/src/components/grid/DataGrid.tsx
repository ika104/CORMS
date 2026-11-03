import * as React from 'react';
import { type GridApi } from 'ag-grid-community';
import { DataGridProps } from './types';
import { useGridController } from './useGridController';
import { GridToolbar } from './GridToolbar';
import { DataGridTable } from './DataGridTable';
import { DataGridCards } from './DataGridCards';
import { Pagination } from './Pagination';
import styles from './DataGrid.module.scss';

export type { DataGridColumn, DataGridProps, ViewMode } from './types';
export { GRID_PAGE_SIZES, GRID_DEFAULT_PAGE_SIZE } from './types';

/** Rows currently visible in the grid, i.e. after column filters and sorting. */
function readDisplayedRows<T>(api: GridApi<T>): T[] {
  const displayed: T[] = [];
  api.forEachNodeAfterFilterAndSort((node) => {
    if (node.data) displayed.push(node.data);
  });
  return displayed;
}

/** Same rows, in the same order, regardless of array identity — callers routinely pass a
 * freshly-derived (e.g. `.filter().map()`) array on every render. */
function sameRows<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((row, i) => row === b[i]);
}

export function DataGrid<T>(props: DataGridProps<T>): React.ReactElement {
  const {
    columns,
    rows,
    loading = false,
    onRefresh,
    getRowId,
    onRowClick,
    defaultViewMode,
    enableViewToggle = true,
    cardRenderer,
    pageSizeOptions,
    emptyStateKey,
    gridId,
    toolbarTitle,
    toolbarLeftActions,
    toolbarRightActions,
    onFilteredRowsChange,
    selectable = false,
    selectedIds,
    onSelectionChange,
  } = props;

  const controller = useGridController({
    gridId,
    defaultViewMode,
    enableViewToggle,
    pageSizeOptions,
  });

  // AG Grid owns filtering/sorting, but pagination is rendered by our own Pagination
  // component (and drives the card view, which AG Grid never sees). So the filtered set
  // has to be mirrored here to keep the row count and card paging in sync.
  const [filteredRows, setFilteredRows] = React.useState<T[]>(rows);

  const { setPage } = controller;

  // Compared against the *previous rows prop*, not against filteredRows: callers pass a
  // freshly-derived array on every render, and onFilteredRowsChange below makes the parent
  // re-render on every filter/sort. Diffing against filteredRows would see "filtered subset
  // !== full row set", reset the mirror to the unfiltered rows, and silently undo the
  // column filter for the row count, the card view and CSV export.
  //
  // In table view this is only the interim value: onModelUpdated fires right after AG Grid
  // re-runs its filters over the new rows and narrows the mirror back down. In card view
  // there is no grid to do that, so this *is* the mirror.
  const prevRowsRef = React.useRef(rows);
  React.useEffect(() => {
    if (sameRows(prevRowsRef.current, rows)) return;
    prevRowsRef.current = rows;
    setFilteredRows(rows);
    // A smaller result set (KPI tile, search box, refresh) can leave the current page out
    // of range, which renders as an empty page and a nonsensical "21 – 2 of 2" range.
    setPage(0);
  }, [rows, setPage]);

  // Latest-ref pattern so callers don't have to memoize an inline callback just to avoid
  // this effect re-firing on every render — only an actual filteredRows change matters.
  const onFilteredRowsChangeRef = React.useRef(onFilteredRowsChange);
  React.useEffect(() => {
    onFilteredRowsChangeRef.current = onFilteredRowsChange;
  });
  React.useEffect(() => {
    onFilteredRowsChangeRef.current?.(filteredRows);
  }, [filteredRows]);

  // Idempotent by row content, not array identity: AG Grid re-emits onModelUpdated on every
  // render (the `rows` prop is a fresh array each time), and bailing out when nothing
  // actually moved is what stops that becoming a render loop through onFilteredRowsChange.
  const handleDisplayedRowsChanged = React.useCallback((api: GridApi<T>) => {
    const displayed = readDisplayedRows(api);
    setFilteredRows((prev) => (sameRows(prev, displayed) ? prev : displayed));
  }, []);

  const handleFilterChanged = React.useCallback(() => {
    // A narrower result set can leave the current page out of range.
    setPage(0);
  }, [setPage]);

  // Cards need a renderer; without one the toggle is hidden and the table always wins.
  const canShowCards = enableViewToggle && !!cardRenderer;
  const showCards = canShowCards && controller.viewMode === 'cards';

  // "Select all on this page" needs exactly the ids on the current page — the same slice
  // DataGridCards takes internally, computed here too so table view gets the same semantics.
  const pagedRows = React.useMemo(
    () => filteredRows.slice(controller.page * controller.pageSize, (controller.page + 1) * controller.pageSize),
    [filteredRows, controller.page, controller.pageSize]
  );
  const pagedIds = React.useMemo(() => pagedRows.map(getRowId), [pagedRows, getRowId]);
  const allPageSelected = selectable && pagedIds.length > 0 && pagedIds.every((id) => selectedIds?.has(id));
  const somePageSelected = selectable && pagedIds.some((id) => selectedIds?.has(id));
  const isSelected = React.useCallback((id: string) => !!selectedIds?.has(id), [selectedIds]);
  const onToggleRow = React.useCallback(
    (id: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedIds ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );
  const onToggleAllOnPage = React.useCallback(() => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds ?? []);
    if (allPageSelected) pagedIds.forEach((id) => next.delete(id));
    else pagedIds.forEach((id) => next.add(id));
    onSelectionChange(next);
  }, [selectedIds, onSelectionChange, pagedIds, allPageSelected]);

  return (
    <div className={styles.dataGrid}>
      <GridToolbar
        title={toolbarTitle}
        leftActions={toolbarLeftActions}
        rightActions={toolbarRightActions}
        onRefresh={onRefresh}
        refreshing={loading}
        viewMode={controller.viewMode}
        onViewModeChange={controller.setViewMode}
        enableViewToggle={canShowCards}
      />

      <div className={styles.gridContent}>
        {showCards && cardRenderer ? (
          <DataGridCards<T>
            rows={filteredRows}
            page={controller.page}
            pageSize={controller.pageSize}
            loading={loading}
            getRowId={getRowId}
            onRowClick={onRowClick}
            cardRenderer={cardRenderer}
            emptyStateKey={emptyStateKey}
            selectable={selectable}
            isSelected={isSelected}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleRow={onToggleRow}
            onToggleAllOnPage={onToggleAllOnPage}
          />
        ) : (
          <DataGridTable<T>
            columns={columns}
            rows={rows}
            loading={loading}
            getRowId={getRowId}
            onRowClick={onRowClick}
            emptyStateKey={emptyStateKey}
            page={controller.page}
            pageSize={controller.pageSize}
            onDisplayedRowsChanged={handleDisplayedRowsChanged}
            onFilterChanged={handleFilterChanged}
            selectable={selectable}
            isSelected={isSelected}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleRow={onToggleRow}
            onToggleAllOnPage={onToggleAllOnPage}
          />
        )}
      </div>

      <Pagination
        page={controller.page}
        pageSize={controller.pageSize}
        totalRows={filteredRows.length}
        pageSizeOptions={controller.pageSizeOptions}
        onPageChange={controller.setPage}
        onPageSizeChange={controller.setPageSize}
      />
    </div>
  );
}
