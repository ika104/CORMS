import { ITaskListFilters } from '../../models/ITaskListFilters';
import { escapeODataLiteral, odataDateTimeLiteral } from './odata';
import { normalizeForFilter } from '../../components/grid/textNormalizer';

// odataDateTimeLiteral (common/odata.ts), not a private copy — this file previously had its own
// `dateLiteral`, deliberately NOT sharing buildCorrespondenceFilter.ts's own dateLiteral: that one
// receives a date-only `YYYY-MM-DD` string from the filter panel and therefore appends its own time
// component, whereas `todayIso` below is already a full UTC-midnight instant (mapTaskRow.ts's
// startOfTodayIso) — appending `T00:00:00Z` to it as well produced the malformed literal
// datetime'2026-01-01T00:00:00.000ZT00:00:00Z', which SharePoint rejects with a 400 (the
// fake-PnPjs harness's lexical string compare happened to still sort it correctly, so the suite
// never caught it). odataDateTimeLiteral takes the same already-a-full-instant input this file's
// old private `dateLiteral` did — same milliseconds-trimming fix, promoted to common/odata.ts once
// DelegationContextResolver.ts needed the identical thing, so it's now one implementation instead
// of two identical ones.

// TODO(confirm): normalizeForFilter is applied only to the query term embedded in the $filter
// clause below — SharePoint REST's substringof matches the raw stored field value, which this
// code never touches. This one-directionally helps for transforms that only *remove* characters
// from the query (tatweel elongation, diacritics) but can actively *break* an otherwise-matching
// query for transforms that *substitute* one letter for another (hamza variants -> ا, ى -> ي,
// ة -> ه): if the stored text still has the original letter, normalizing only the query no longer
// matches it as a raw substring. True two-directional normalization would need a maintained
// normalized shadow column (or a client-side pass), out of scope here — this mirrors the "helper
// reused for the free-text search" instruction as a best-effort improvement over
// buildCorrespondenceFilter.ts's current raw substringof (no normalization at all), not a
// guarantee against every stored-text spelling variant.
function normalizedLiteral(value: string): string {
  return escapeODataLiteral(normalizeForFilter(value) ?? '');
}

/**
 * Translates ITaskListFilters (CMS-049 AC5) into a single SharePoint REST $filter clause against
 * CORMS_Tasks — the task-list equivalent of buildCorrespondenceFilter.ts, not a modification of
 * that shared correspondence helper (CORMS_Tasks has its own field names/shape). Reuses the same
 * Arabic-aware text-normalization helper (normalizeForFilter) as the grid's client-side text
 * filter for freeText, per the task's explicit instruction — unlike buildCorrespondenceFilter's
 * freeText clause, which only escapes quotes today. Every ITaskListFilters field except
 * `assignee` translates to a server-side clause (see the note at the bottom of this function).
 *
 * `baseClause` is the caller's own fixed condition (e.g. a tile's server-side scoping, when one is
 * needed) — ANDed with everything below. Today TaskListServiceCore.getAll() always passes a
 * tautological base clause (no tile is a separate server query — see that file's comment), but the
 * parameter is kept for symmetry with buildCorrespondenceFilter's shape and in case a future
 * caller needs one.
 */
export function buildTaskFilter(baseClause: string, filters: ITaskListFilters | undefined, todayIso: string): string {
  const clauses: string[] = [baseClause];

  if (filters?.freeText) {
    const term = normalizedLiteral(filters.freeText);
    clauses.push(`(substringof('${term}',Title) or substringof('${term}',ReferenceNo))`);
  }
  if (filters?.type) {
    clauses.push(`TaskType eq '${escapeODataLiteral(filters.type)}'`);
  }
  if (filters?.priority) {
    clauses.push(`Priority eq '${escapeODataLiteral(filters.priority)}'`);
  }
  if (filters?.status) {
    if (filters.status === 'Overdue') {
      // Flagged design decision (CMS-049 AC4/AC7): "Overdue" is a computed condition, not
      // necessarily a trustworthy literal Status value — Power Apps (out of this task's scope)
      // may not proactively flip Status to 'Overdue' the moment a due date passes. Filtering by
      // the computed condition here matches the same override applied by mapTaskRow's
      // computeTaskDisplayStatus, so the grid/tiles and this filter never disagree.
      // TODO(confirm): if Power Apps is later confirmed to reliably write Status='Overdue' itself,
      // this computed-override logic could be simplified to a direct field read — kept as
      // computed here since we don't control that write path.
      clauses.push(`(DueDate lt ${odataDateTimeLiteral(todayIso)} and Status ne 'Completed')`);
    } else {
      clauses.push(`Status eq '${escapeODataLiteral(filters.status)}'`);
    }
  }
  // `filters.assignee` is deliberately NOT translated into a clause here. AssignedToUser is a
  // People (Lookup-derived) field, and SharePoint REST only supports eq/ne on a projected lookup
  // path — substringof('…',AssignedToUser/Title) is rejected with a 400, which would have made
  // every assignee-filtered query (Advanced Search's Tasks type) fail outright in live mode.
  // TaskListServiceCore applies it client-side over the mapped rows instead; see that file.

  return clauses.join(' and ');
}
