import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { escapeODataLiteral } from './odata';
import { mapStatusToListValue } from './mapCorrespondenceRow';
import { securityLevelsAtOrBelow } from './clearance';

/** SharePoint REST datetime literal, e.g. datetime'2024-01-01T00:00:00Z'. */
function dateLiteral(isoDate: string, endOfDay: boolean): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `datetime'${isoDate}T${time}Z'`;
}

/**
 * Translates ICorrespondenceListFilters (CMS-039 AC5/AC6) plus a mandatory clearance ceiling
 * (AC8) into a single SharePoint REST $filter clause. Shared by CorrespondenceListService (Part
 * 2) and CustomFolderService (Part 5, folder CriteriaJSON) — "the same $filter builder used
 * elsewhere" per the task, not a second implementation.
 *
 * `baseClause` is the caller's own fixed condition (e.g. Direction/AssignedTo for Inbox) — ANDed
 * with everything below rather than merged into `filters`, since it's never user-editable.
 */
export function buildCorrespondenceFilter(
  baseClause: string,
  filters: ICorrespondenceListFilters | undefined,
  userClearanceTier: number
): string {
  const clauses: string[] = [baseClause];

  if (filters?.freeText) {
    const term = escapeODataLiteral(filters.freeText);
    clauses.push(`(substringof('${term}',Title) or substringof('${term}',ReferenceNo))`);
  }
  if (filters?.dateFrom) {
    clauses.push(`DateCreated ge ${dateLiteral(filters.dateFrom, false)}`);
  }
  if (filters?.dateTo) {
    clauses.push(`DateCreated le ${dateLiteral(filters.dateTo, true)}`);
  }
  if (filters?.status) {
    clauses.push(`Status eq '${escapeODataLiteral(mapStatusToListValue(filters.status))}'`);
  }
  if (filters?.securityLevel) {
    clauses.push(`SecurityLevel eq '${escapeODataLiteral(filters.securityLevel)}'`);
  }
  if (filters?.department) {
    clauses.push(`substringof('${escapeODataLiteral(filters.department)}',DestinationDepartments)`);
  }
  if (filters?.quickFilter === 'highPriority') {
    clauses.push(`Priority eq 'High'`);
  }

  // Clearance trimming (AC8) — always applied, not opt-in. See clearance.ts's file comment: this
  // is application-layer (query-level) enforcement, defense-in-depth, not SharePoint item-level
  // security.
  const allowedLevels = securityLevelsAtOrBelow(userClearanceTier);
  clauses.push(`(${allowedLevels.map((level) => `SecurityLevel eq '${escapeODataLiteral(level)}'`).join(' or ')})`);

  return clauses.join(' and ');
}
