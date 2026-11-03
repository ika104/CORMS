import { IRecordsHubService } from '../interfaces/IRecordsHubService';
import { DEFAULT_CLEARANCE_TIER } from './clearance';

/**
 * Shared "read the acting user's clearance tier, fail safe" logic for every `*.live.ts` wrapper
 * that resolves clearance via `IRecordsHubService.getCurrentUser()`
 * (CorrespondenceListServiceLive, CorrespondenceDashboardServiceLive, and — per the same pattern
 * — CorrespondenceDetailServiceLive/NavigationServiceLive/BadgeCountServiceLive/
 * BulkActionsServiceLive, though this fix only touches the two Part 4/5 wrappers this task's own
 * toggle actually activates).
 *
 * Found via manual testing: on a site where `recordsHubSiteUrl` hasn't been configured to a real
 * RecordsHub site yet (still ConfigService's TODO-CONFIRM default), `getCurrentUser()` fails with
 * a DNS error — and without a catch, that rejection propagated out of the whole query (getInbox/
 * getSent/getDrafts/getAll) and silently emptied it (zero tiles, empty grid, no visible error).
 * clearance.ts's own `DEFAULT_CLEARANCE_TIER` doc comment already establishes this exact
 * "unresolved clearance" case should fail safe, not fail the whole query — this just actually
 * implements that with a catch.
 */
export async function resolveClearanceTierSafely(recordsHubService: IRecordsHubService): Promise<number> {
  try {
    const user = await recordsHubService.getCurrentUser();
    return user.clearanceTier ?? DEFAULT_CLEARANCE_TIER;
  } catch {
    return DEFAULT_CLEARANCE_TIER;
  }
}
