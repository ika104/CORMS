import { IDelegationRecord } from '../interfaces/IDelegationService';
import { normalizedContains } from '../common/normalizedContains';

/**
 * CMS-017 AC6's free-text search: delegator name, delegate name, or reason. Applied in memory
 * rather than as a `$filter` substring because delegator/delegate names aren't literal
 * CORMS_Delegations columns — they only exist once the User fields are expanded.
 *
 * Shared by DelegationServiceCore and DelegationServiceMock for the same reason
 * common/normalizedContains.ts is shared by TaskListServiceCore and its mock: so mock and live mode
 * agree on which fields "search" covers instead of each keeping its own copy.
 */
export function matchesDelegationSearch(record: IDelegationRecord, search: string): boolean {
  return (
    normalizedContains(record.delegatorName, search) ||
    normalizedContains(record.delegateName, search) ||
    normalizedContains(record.reason, search)
  );
}

/** `matchesDelegationSearch`, applied over a list — the exact filter both DelegationServiceCore
 * (listMine/listAll/getDelegationLedger) and DelegationServiceMock apply to their already-fetched
 * rows, so this one-line combinator lives in exactly one place instead of being copy-pasted per
 * implementation. */
export function applyDelegationSearch(records: IDelegationRecord[], search: string | undefined): IDelegationRecord[] {
  if (!search) return records;
  return records.filter((r) => matchesDelegationSearch(r, search));
}
