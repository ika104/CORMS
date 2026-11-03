import { escapeODataLiteral } from '../../services/common/odata';
import { normalizeForFilter } from './textNormalizer';

export type ColumnFilterType = 'text' | 'number' | 'date';

export interface IColumnFilterSpec {
  /** The SharePoint REST field name to filter on (not the grid's model field name, when they differ). */
  field: string;
  type: ColumnFilterType;
}

/**
 * Translates a single grid column's filter value into a SharePoint REST $filter clause fragment
 * (CMS-044 AC9). Text columns reuse the exact same Arabic-aware normalization
 * (normalizeForFilter, textNormalizer.ts) the grid's existing in-memory AG-grid text filter
 * already applies — that logic doesn't change, it now also shapes what gets sent to SharePoint,
 * not just what's compared client-side.
 *
 * Standalone and framework-agnostic on purpose: this is the translation logic itself, unit-tested
 * in isolation. DataGrid's own per-column filter UI is entirely client-side/in-memory today (see
 * DataGrid.tsx / useGridController.ts) — wiring this builder into that UI so a column filter
 * triggers a real server round-trip is a follow-up integration step, not part of this task.
 * TODO(confirm): wire into DataGrid's column filter change callback once that's ready.
 */
export function buildColumnFilterClause(column: IColumnFilterSpec, rawValue: string): string {
  switch (column.type) {
    case 'text': {
      const normalized = normalizeForFilter(rawValue) ?? '';
      return `substringof('${escapeODataLiteral(normalized)}',${column.field})`;
    }
    case 'number':
      return `${column.field} eq ${Number(rawValue)}`;
    case 'date':
      return `${column.field} eq datetime'${escapeODataLiteral(rawValue)}T00:00:00Z'`;
    default:
      return '';
  }
}
