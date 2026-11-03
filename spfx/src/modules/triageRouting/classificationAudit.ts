import { ICorrespondenceStub, SECURITY_TIERS } from '../../models/ICorrespondence';
import { ITriageDraft } from './types';

/**
 * CMS-010 — the pure rules behind classifying an incoming item at receive time: the before/after
 * diff of the core metadata (AC5), whether a change touches the Security Level (which, like an
 * amendment after capture, must carry a reason — AC9), and the structured audit payload written to
 * the global audit log. Dependency-free of React so each rule is unit-testable.
 */

export type ClassifyFieldKey = 'type' | 'priority' | 'securityTier' | 'recordClassification' | 'responseDeadline';

/** The core-metadata fields this interface classifies, in display order (AC1/AC7 + the AC3
 * deadline). Security Level is included but is the one field that always requires a reason to
 * change (AC9), so callers route it through the amend flow rather than editing it inline. */
export const CLASSIFY_FIELDS: ClassifyFieldKey[] = ['type', 'priority', 'securityTier', 'recordClassification', 'responseDeadline'];

const EMPTY_LABEL = '—';

/** A normalized view of an item's classifiable metadata — the common shape the item's own values
 * and a proposed triage draft are both projected onto so they can be diffed field-by-field. */
export interface IClassificationSnapshot {
  type?: string;
  priority?: string;
  securityTier?: number;
  recordClassificationLabel?: string;
  responseDeadline?: string;
}

export interface IClassifyChange {
  field: ClassifyFieldKey;
  /** Display-ready before/after values for the audit trail (AC5/AC9). */
  from: string;
  to: string;
}

export function securityLevelName(tier: number | undefined): string {
  if (tier === undefined) return EMPTY_LABEL;
  return SECURITY_TIERS.find((s) => s.tier === tier)?.name ?? String(tier);
}

/** The item's classification as captured so far — the "before" baseline. `dueDate` doubles as the
 * captured handling/response deadline (AC3) until a dedicated field exists on the stub. */
export function snapshotFromItem(item: ICorrespondenceStub): IClassificationSnapshot {
  return {
    type: item.type,
    priority: item.priority,
    securityTier: item.securityTier,
    recordClassificationLabel: item.recordClassificationName,
    responseDeadline: item.dueDate,
  };
}

/** The officer's proposed classification — the "after". */
export function snapshotFromDraft(draft: ITriageDraft): IClassificationSnapshot {
  return {
    type: draft.contentTypeName,
    priority: draft.priority,
    securityTier: draft.securityTier,
    recordClassificationLabel: draft.recordClassificationLabel,
    responseDeadline: draft.responseDeadline,
  };
}

function label(field: ClassifyFieldKey, snap: IClassificationSnapshot): string {
  switch (field) {
    case 'type':
      return snap.type || EMPTY_LABEL;
    case 'priority':
      return snap.priority || EMPTY_LABEL;
    case 'securityTier':
      return securityLevelName(snap.securityTier);
    case 'recordClassification':
      return snap.recordClassificationLabel || EMPTY_LABEL;
    case 'responseDeadline':
      return snap.responseDeadline || EMPTY_LABEL;
    default:
      return EMPTY_LABEL;
  }
}

function rawEqual(field: ClassifyFieldKey, before: IClassificationSnapshot, after: IClassificationSnapshot): boolean {
  switch (field) {
    case 'type':
      return (before.type ?? '') === (after.type ?? '');
    case 'priority':
      return (before.priority ?? '') === (after.priority ?? '');
    case 'securityTier':
      return before.securityTier === after.securityTier;
    case 'recordClassification':
      return (before.recordClassificationLabel ?? '') === (after.recordClassificationLabel ?? '');
    case 'responseDeadline':
      return (before.responseDeadline ?? '') === (after.responseDeadline ?? '');
    default:
      return true;
  }
}

/** One entry per changed core-metadata field, with display-ready before/after values (AC5). An
 * `after` field that is left unset does not erase a captured value it never carried — an unset
 * field simply matches the baseline and produces no change (AC8). */
export function diffClassification(before: IClassificationSnapshot, after: IClassificationSnapshot): IClassifyChange[] {
  return CLASSIFY_FIELDS.filter((field) => {
    // AC8 — a field the officer leaves unset in the draft is not treated as "cleared": only a
    // present value that actually differs counts as a change.
    if (after[classifyValueKey(field)] === undefined || after[classifyValueKey(field)] === '') {
      return false;
    }
    return !rawEqual(field, before, after);
  }).map((field) => ({ field, from: label(field, before), to: label(field, after) }));
}

// Maps a field key to the snapshot property that holds its value, so the "unset" guard above can
// read it generically.
function classifyValueKey(field: ClassifyFieldKey): keyof IClassificationSnapshot {
  return field === 'securityTier' ? 'securityTier' : field === 'recordClassification' ? 'recordClassificationLabel' : field;
}

/** AC9 — a change to the Security Level always requires a reason (its own explicit example), the
 * same guarantee the post-capture amend flow gives every core field. */
export function includesSecurityChange(changes: IClassifyChange[]): boolean {
  return changes.some((c) => c.field === 'securityTier');
}

/** The structured audit payload (AC5/AC9): the ordered before/after changes plus the amendment
 * reason when one was required. Stored as the audit entry's `details` string. */
export function buildClassificationAuditDetails(input: { changes: IClassifyChange[]; reason?: string }): string {
  return JSON.stringify({
    changes: input.changes.map((c) => ({ field: c.field, from: c.from, to: c.to })),
    ...(input.reason ? { reason: input.reason } : {}),
  });
}

/** A short human summary — "Security Level: Secret → Top Secret; Priority: Normal → High" — using a
 * caller-supplied field-label resolver (so it stays i18n-agnostic and testable). */
export function describeChanges(changes: IClassifyChange[], fieldLabel: (field: ClassifyFieldKey) => string): string {
  return changes.map((c) => `${fieldLabel(c.field)}: ${c.from} → ${c.to}`).join('; ');
}
