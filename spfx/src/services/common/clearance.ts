import type { SPFI } from '@pnp/sp';
import { CORMS_CORRESPONDENCE_SCHEMA } from '../../provisioning/listSchemas';

/**
 * Shared clearance-enforcement helpers, reused by every Epic 1 live service that must trim or
 * gate on security tier — CorrespondenceListService (Part 2 AC8), CorrespondenceDetailService
 * (Part 3 AC9), CustomFolderService (Part 5 AC7), BulkActionsService (Part 6 AC8) — so the rule
 * lives in exactly one place, not reimplemented per service.
 *
 * NOTE: clearance tier itself is not owned by this task — it stays resolved through the existing
 * ds.securityTiers mock/live toggle (RecordsHub-owned), represented today by IUser.clearanceTier.
 * There is no concrete ds.securityTiers service in this codebase yet (see
 * src/services/dataSource/dataSourceConfig.ts — `implemented: false`), so IUser.clearanceTier is
 * the only existing representation of "current user's resolved clearance"; live services here read
 * it via the already-live-toggled IRecordsHubService.getCurrentUser(), never a second source.
 * TODO(confirm): once a concrete ds.securityTiers service exists, clearance resolution should move
 * there instead of IUser.clearanceTier — out of scope for this task per its own instructions not to
 * touch ds.securityTiers.
 *
 * NOTE: this is application-layer enforcement (query-level filtering / a service-level denial
 * check), not SharePoint item-level security. SharePoint list items are not natively secured by
 * this filter alone — true enforcement would require SharePoint item-level permissions or a
 * middleware layer, which is out of scope for this task. Treat this as defense-in-depth, not a
 * hard security boundary, until that's addressed.
 */

/** Safe-by-default when a user's clearance is unresolved (e.g. RecordsHubServiceLive.getCurrentUser()
 * does not set clearanceTier yet — a known RecordsHub-owned gap, not fixed by this task). */
export const DEFAULT_CLEARANCE_TIER = 1;

/**
 * The SharePoint SecurityLevel Choice field's actual values (listSchemas.ts) do NOT exactly match
 * SECURITY_TIERS[].name's display strings — the schema uses 'Public/Unclassified' (no spaces),
 * SECURITY_TIERS uses 'Public / Unclassified' (spaced, for UI display). Deriving this mapping from
 * the schema's own `choices` array (rather than SECURITY_TIERS.name) is deliberate: it's the one
 * source of truth for what a live SharePoint row's SecurityLevel value can actually be, so this
 * mapping can never silently drift from what's really provisioned. Both arrays share the same
 * tier1..tier5 ascending order, matched by index.
 */
const SECURITY_LEVEL_CHOICES: string[] =
  CORMS_CORRESPONDENCE_SCHEMA.fields.find((f) => f.name === 'SecurityLevel')?.choices ?? [];

const SECURITY_LEVEL_TO_TIER = new Map<string, number>(SECURITY_LEVEL_CHOICES.map((choice, i) => [choice, i + 1]));

/** Highest defined clearance tier (top of the SecurityLevel scale, 5 = Top Secret). A user granted
 * this tier is within clearance for every classification — used to give a SystemAdministrator full
 * visibility regardless of what their CORMS_UserRoles.ClearanceTier row happens to hold. */
export const MAX_CLEARANCE_TIER = SECURITY_LEVEL_CHOICES.length;

/** Maps CORMS_Correspondence's SecurityLevel Choice string (e.g. "Top Secret") to the numeric
 * tier used by IUser.clearanceTier / SECURITY_TIERS. Unknown/blank values are treated as the
 * highest tier (5) — safe-by-default: an unrecognized classification is never under-protected. */
export function securityLevelToTier(securityLevel: string | undefined): number {
  if (!securityLevel) return DEFAULT_CLEARANCE_TIER;
  return SECURITY_LEVEL_TO_TIER.get(securityLevel) ?? 5;
}

/**
 * Reverse of securityLevelToTier — for writes (CorrespondenceServiceCore). Never throws on an
 * unexpected tier number:
 * - unset / 0 / negative => undefined, i.e. "no classification chosen yet" (a legitimate draft
 *   state — the write mapper persists it as an empty SecurityLevel).
 * - above the highest defined choice => clamped to the *most* restrictive choice, mirroring
 *   securityLevelToTier's own safe-by-default stance that an unrecognized classification is
 *   treated as tier 5. Without the clamp an out-of-range tier would write a blank SecurityLevel,
 *   which the read side then maps back to DEFAULT_CLEARANCE_TIER (1) — silently declassifying
 *   the item to everyone, exactly the wrong direction to fail in.
 */
export function tierToSecurityLevel(tier: number | undefined): string | undefined {
  if (!tier || tier < 1) return undefined;
  if (tier > SECURITY_LEVEL_CHOICES.length) return SECURITY_LEVEL_CHOICES[SECURITY_LEVEL_CHOICES.length - 1];
  return SECURITY_LEVEL_CHOICES[tier - 1];
}

export function isWithinClearance(itemTier: number, userClearanceTier: number): boolean {
  return itemTier <= userClearanceTier;
}

/** SecurityLevel Choice values at-or-below the given clearance tier — for building a REST
 * `SecurityLevel in (...)`-style $filter clause. */
export function securityLevelsAtOrBelow(userClearanceTier: number): string[] {
  return SECURITY_LEVEL_CHOICES.filter((_choice, i) => i + 1 <= userClearanceTier);
}

export type ClearanceCheckResult = 'ok' | 'denied' | 'notfound';

/**
 * CMS-040 Part 1 — the shared "select SecurityLevel only, then decide" guard every Correspondence
 * Detail tab method calls before fetching its own data, extracted once instead of duplicated
 * across getDetail/getAttachments/getSecurityAssignments/getAuditTrail/getTimeline/getThread/
 * getReminder. 'notfound' is kept distinct from 'denied' so getDetail can preserve its existing
 * `undefined` (not found) vs `{accessDenied:true}` (found, insufficient clearance) distinction —
 * callers that don't need that distinction (every other tab method) simply treat both as denied.
 */
export async function checkCorrespondenceClearance(
  sp: SPFI,
  listTitle: string,
  idNum: number,
  userClearanceTier: number
): Promise<ClearanceCheckResult> {
  let row: { SecurityLevel?: string } | undefined;
  try {
    row = await sp.web.lists.getByTitle(listTitle).items.getById(idNum).select('SecurityLevel')();
  } catch {
    return 'notfound';
  }
  return isWithinClearance(securityLevelToTier(row?.SecurityLevel), userClearanceTier) ? 'ok' : 'denied';
}
