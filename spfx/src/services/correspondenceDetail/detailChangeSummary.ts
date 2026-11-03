import { IDetailFieldPatch } from '../interfaces/ICorrespondenceDetailService';
import { formatCardDate } from '../../utils/formatDateTime';

/** The item's values before an edit, used to compute the before→after audit diff. All strings are
 * the raw stored values (a person is its display name; a date is whatever SharePoint returned). */
export interface IDetailBefore {
  originatingFunction?: string;
  dueDate?: string;
  comment?: string;
  assignedToName?: string;
}

/** One field that actually changed, with human-readable before/after values for the audit row.
 * `field` names the logical field so the service can map it to the right SharePoint column. */
export interface IDetailChange {
  field: 'originatingFunction' | 'dueDate' | 'assignedTo' | 'comment';
  label: string;
  before: string;
  after: string;
}

const FIELD_LABELS: Record<IDetailChange['field'], string> = {
  originatingFunction: 'Originating Function',
  dueDate: 'Due Date',
  assignedTo: 'Assigned To',
  comment: 'Comments',
};

const EMPTY = '—';

function norm(value: string | undefined): string {
  return (value ?? '').trim();
}

/** A date column may come back as a full ISO timestamp or a bare date; compare (and display) on the
 * date part alone so a stored "2026-09-23T00:00:00Z" and an edited "2026-09-23" are not a change. */
function dateKey(value: string | undefined): string {
  return norm(value).slice(0, 10);
}

/**
 * Computes the ordered set of changes between the item's previous values and a Details-tab patch.
 * Only fields present on the patch are considered, and only those whose value actually differs are
 * returned — so an "edit" that re-selects the same value produces no audit noise. Pure and
 * UI-agnostic: the service uses it for the persisted audit row and the view for its optimistic echo,
 * so both describe the change identically.
 */
export function diffDetailPatch(before: IDetailBefore, patch: IDetailFieldPatch): IDetailChange[] {
  const changes: IDetailChange[] = [];

  if (patch.originatingFunction !== undefined && norm(before.originatingFunction) !== norm(patch.originatingFunction)) {
    changes.push({
      field: 'originatingFunction',
      label: FIELD_LABELS.originatingFunction,
      before: norm(before.originatingFunction) || EMPTY,
      after: norm(patch.originatingFunction) || EMPTY,
    });
  }

  if (patch.dueDate !== undefined && dateKey(before.dueDate) !== dateKey(patch.dueDate)) {
    changes.push({
      field: 'dueDate',
      label: FIELD_LABELS.dueDate,
      before: before.dueDate ? formatCardDate(before.dueDate) : EMPTY,
      after: patch.dueDate ? formatCardDate(patch.dueDate) : EMPTY,
    });
  }

  if (patch.assignedTo !== undefined && norm(before.assignedToName) !== norm(patch.assignedTo.name)) {
    changes.push({
      field: 'assignedTo',
      label: FIELD_LABELS.assignedTo,
      before: norm(before.assignedToName) || EMPTY,
      after: norm(patch.assignedTo.name) || EMPTY,
    });
  }

  if (patch.comment !== undefined && norm(before.comment) !== norm(patch.comment)) {
    changes.push({
      field: 'comment',
      label: FIELD_LABELS.comment,
      before: norm(before.comment) || EMPTY,
      after: norm(patch.comment) || EMPTY,
    });
  }

  return changes;
}

/** Renders the changes as a single audit line: `Field: before → after; Field: before → after`. */
export function formatDetailChanges(changes: IDetailChange[]): string {
  return changes.map((c) => `${c.label}: ${c.before} → ${c.after}`).join('; ');
}
