import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AgGridReact, AgGridProvider } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  LocaleModule,
  PaginationModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CellStyleModule,
  RowStyleModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type ColDefField,
  type GridReadyEvent,
  type GridApi,
  type ModelUpdatedEvent,
  type RowClickedEvent,
  type Module,
} from 'ag-grid-community';
import { useLocale } from '../../i18n/LocalizationProvider';
import { DataGridColumn } from './types';
import { DEFAULT_TEXT_FILTER_PARAMS } from './textNormalizer';
import { getGridLocaleText } from './gridLocale';
import { LoadingOverlay } from './overlays/LoadingOverlay';
import { NoRowsOverlay } from './overlays/NoRowsOverlay';
import styles from './DataGrid.module.scss';

// AG Grid v36 is fully modular — every feature used below must be registered here or it
// fails at runtime. ValidationModule provides the descriptive dev-time errors; it is the
// one to drop first if bundle size ever becomes a concern.
const GRID_MODULES: Module[] = [
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  LocaleModule,
  PaginationModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CellStyleModule,
  RowStyleModule,
  ValidationModule,
];

// TODO(confirm): Theming API vs legacy CSS theme in SPFx/Heft — defaulting to Theming API.
// If bundling issues arise, fall back to ag-theme-quartz with CSS-variable overrides.
const cormsTheme = themeQuartz.withParams({
  headerBackgroundColor: 'var(--corms-neutral-panel)',
  headerTextColor: 'var(--corms-text-secondary)',
  headerFontWeight: 600,
  headerFontSize: 13,
  backgroundColor: 'var(--corms-neutral-page)',
  foregroundColor: 'var(--corms-text-primary)',
  borderColor: 'var(--corms-neutral-border)',
  rowHoverColor: 'var(--corms-neutral-panel)',
  selectedRowBackgroundColor: 'var(--corms-rail-background-active)',
  fontSize: 13,
  rowBorder: true,
  wrapperBorderRadius: 0,
  headerColumnResizeHandleColor: 'var(--corms-neutral-border)',
  accentColor: 'var(--corms-brand-navy)',
});

const FILTER_MAP: Record<string, string> = {
  text: 'agTextColumnFilter',
  number: 'agNumberColumnFilter',
  date: 'agDateColumnFilter',
};

function buildColDefs<T>(columns: DataGridColumn<T>[], t: (key: string) => string): ColDef<T>[] {
  return columns.map((col) => {
    const def: ColDef<T> = {
      field: col.field as unknown as ColDefField<T>,
      headerName: t(col.headerKey),
      sortable: col.sortable !== false,
      width: col.width,
      minWidth: col.minWidth,
      flex: col.flex ?? (col.width ? undefined : 1),
      pinned: col.pinned,
      // Initial sort direction (the user can still click to re-sort). AG Grid applies it on first
      // render; sortIndex 0 makes this the primary sort when set on a single column.
      sort: col.initialSort,
      sortIndex: col.initialSort ? 0 : undefined,
      // AG Grid's default cell line-height matches the row height, which baseline-aligns
      // short inline content (badges, icons) instead of centering it. Flexing the cell
      // itself sidesteps that regardless of what a column's cellRenderer returns.
      cellStyle: { display: 'flex', alignItems: 'center' },
    };

    if (col.filter && FILTER_MAP[col.filter]) {
      def.filter = FILTER_MAP[col.filter];
      def.floatingFilter = true;

      if (col.filter === 'text') {
        def.filterParams = { ...DEFAULT_TEXT_FILTER_PARAMS, ...col.filterParams };
      } else if (col.filterParams) {
        def.filterParams = col.filterParams;
      }
    } else {
      def.filter = false;
    }

    if (col.cellRenderer) {
      const renderer = col.cellRenderer;
      def.cellRenderer = (params: { data: T | undefined }) => {
        if (!params.data) return null;
        return renderer(params.data);
      };
      // The cellRenderer owns the cell's visual output regardless of the raw field value, so
      // AG Grid's automatic cell-data-type inference (and its warning when that value is an
      // object with no valueFormatter, e.g. AG Grid #48) is skipped rather than worked around.
      def.cellDataType = false;
    }

    return def;
  });
}

// A plain checkbox ColDef, not AG Grid's built-in row-selection feature — selection state
// is owned by the caller (DataGrid.tsx) so it survives page/view-mode changes, and this
// stays consistent with the equally hand-rolled checkbox in DataGridCards.
function buildSelectionColDef<T>(params: {
  getRowId: (row: T) => string;
  isSelected: (id: string) => boolean;
  onToggleRow: (id: string) => void;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleAllOnPage: () => void;
  selectAllLabel: string;
  selectRowLabel: string;
}): ColDef<T> {
  const { getRowId, isSelected, onToggleRow, allPageSelected, somePageSelected, onToggleAllOnPage, selectAllLabel, selectRowLabel } =
    params;
  return {
    colId: '__selection__',
    headerName: '',
    width: 40,
    minWidth: 40,
    maxWidth: 40,
    pinned: 'left',
    sortable: false,
    filter: false,
    resizable: false,
    suppressMovable: true,
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    headerComponent: () => (
      <input
        type="checkbox"
        className={styles.selectionCheckbox}
        checked={allPageSelected}
        ref={(el) => {
          if (el) el.indeterminate = !allPageSelected && somePageSelected;
        }}
        onChange={onToggleAllOnPage}
        aria-label={selectAllLabel}
      />
    ),
    cellRenderer: (p: { data: T | undefined }) => {
      if (!p.data) return null;
      const id = getRowId(p.data);
      return (
        <input
          type="checkbox"
          className={styles.selectionCheckbox}
          checked={isSelected(id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleRow(id)}
          aria-label={selectRowLabel}
        />
      );
    },
  };
}

export interface IDataGridTableProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  loading?: boolean;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyStateKey?: string;
  page: number;
  pageSize: number;
  /**
   * Fires whenever AG Grid's displayed row set may have changed — a column filter, a sort,
   * *and* a new `rows` prop, which the filter/sort events alone do not cover. This is the
   * single source of truth for the mirror DataGrid keeps for pagination/cards/export.
   */
  onDisplayedRowsChanged?: (api: GridApi<T>) => void;
  /** Filter-specific side effects only (page reset) — mirroring goes through onDisplayedRowsChanged. */
  onFilterChanged?: () => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  allPageSelected?: boolean;
  somePageSelected?: boolean;
  onToggleRow?: (id: string) => void;
  onToggleAllOnPage?: () => void;
}

export function DataGridTable<T>(props: IDataGridTableProps<T>): React.ReactElement {
  const {
    columns,
    rows,
    loading,
    getRowId,
    onRowClick,
    emptyStateKey,
    page,
    pageSize,
    onDisplayedRowsChanged,
    onFilterChanged,
    selectable,
    isSelected,
    allPageSelected,
    somePageSelected,
    onToggleRow,
    onToggleAllOnPage,
  } = props;

  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const apiRef = React.useRef<GridApi<T>>();

  const colDefs = React.useMemo(() => {
    const base = buildColDefs(columns, t);
    if (!selectable || !isSelected || !onToggleRow || !onToggleAllOnPage) return base;
    return [
      buildSelectionColDef<T>({
        getRowId,
        isSelected,
        onToggleRow,
        allPageSelected: !!allPageSelected,
        somePageSelected: !!somePageSelected,
        onToggleAllOnPage,
        selectAllLabel: t(allPageSelected ? 'grid.selection.deselectAllOnPage' : 'grid.selection.selectAllOnPage'),
        selectRowLabel: t('grid.selection.selectRow'),
      }),
      ...base,
    ];
  }, [columns, t, selectable, isSelected, allPageSelected, somePageSelected, onToggleRow, onToggleAllOnPage, getRowId]);
  // getGridLocaleText reads i18next directly; `t` is the dependency that makes the
  // strings recompute when the language changes.
  const localeText = React.useMemo(() => getGridLocaleText(), [t]);

  const getRowIdCallback = React.useCallback((params: { data: T }) => getRowId(params.data), [getRowId]);

  const onGridReady = React.useCallback((event: GridReadyEvent<T>) => {
    apiRef.current = event.api;
  }, []);

  // Clearing the ref on teardown keeps the effects below from calling into a destroyed
  // grid (AG Grid #26) when this unmounts mid-update — e.g. on a view-mode switch.
  const onGridPreDestroyed = React.useCallback(() => {
    apiRef.current = undefined;
  }, []);

  const handleRowClicked = React.useCallback(
    (event: RowClickedEvent<T>) => {
      // AG Grid emits its row-click event from a native listener, outside React's synthetic
      // stopPropagation boundary. Without this guard, clicking a table-row overflow trigger both
      // opens the menu and navigates to the row. Cards do not have that native listener, hence the
      // apparent table-only regression.
      const target = event.event?.target;
      if (target instanceof Element && target.closest('[data-actions-menu]')) return;
      if (onRowClick && event.data) {
        onRowClick(event.data);
      }
    },
    [onRowClick]
  );

  // onModelUpdated is the one event that fires for every reason the displayed set can
  // change — filter, sort, and a replaced rowData — so the mirror stays correct when the
  // caller narrows `rows` while a column filter is still applied, and when the grid
  // remounts (view-mode toggle) and AG Grid's own filter state is discarded.
  const handleModelUpdated = React.useCallback(
    (event: ModelUpdatedEvent<T>) => {
      if (onDisplayedRowsChanged) {
        onDisplayedRowsChanged(event.api);
      }
    },
    [onDisplayedRowsChanged]
  );

  const handleFilterChanged = React.useCallback(() => {
    if (onFilterChanged) {
      onFilterChanged();
    }
  }, [onFilterChanged]);

  // Page size needs no equivalent effect — paginationPageSize is a reactive grid option
  // in v36, so AG Grid picks the change up from the prop directly.
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || api.isDestroyed()) return;
    api.paginationGoToPage(page);
  }, [page]);

  // The `loading` grid option prop (passed to AgGridReact below) now drives the loading
  // overlay declaratively — imperative api.showLoadingOverlay() is deprecated (AG Grid #308).
  // This effect only still needs to own the no-rows overlay, and only once loading has cleared.
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || api.isDestroyed() || loading) return;
    if (rows.length === 0) {
      api.showNoRowsOverlay();
    } else {
      api.hideOverlay();
    }
  }, [loading, rows.length]);

  const noRowsOverlayComponent = React.useMemo(() => {
    const Overlay: React.FC = () => <NoRowsOverlay messageKey={emptyStateKey} />;
    return Overlay;
  }, [emptyStateKey]);

  // Visual affordance for the same behaviour DataGridCards already gives its rows
  // (.cardItemClickable) — a clickable row should look clickable.
  const getRowStyle = React.useCallback(
    () => (onRowClick ? { cursor: 'pointer' } : undefined),
    [onRowClick]
  );

  return (
    <AgGridProvider modules={GRID_MODULES}>
      <div className={styles.tableWrap}>
        <AgGridReact<T>
          theme={cormsTheme}
          columnDefs={colDefs}
          rowData={rows}
          getRowId={getRowIdCallback}
          enableRtl={isRtl}
          localeText={localeText}
          pagination={true}
          paginationPageSize={pageSize}
          paginationPageSizeSelector={false}
          suppressPaginationPanel={true}
          domLayout="autoHeight"
          onGridReady={onGridReady}
          onGridPreDestroyed={onGridPreDestroyed}
          onRowClicked={handleRowClicked}
          getRowStyle={getRowStyle}
          onModelUpdated={handleModelUpdated}
          onFilterChanged={handleFilterChanged}
          loadingOverlayComponent={LoadingOverlay}
          noRowsOverlayComponent={noRowsOverlayComponent}
          loading={loading}
          suppressCellFocus={true}
        />
      </div>
    </AgGridProvider>
  );
}
