import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import '@pnp/sp/batching';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IBulkActionResult, IBulkActionsService } from '../interfaces/IBulkActionsService';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { resolveMyClearanceTierFromUserRoles } from '../common/mapUserRoleRow';
import { BulkActionsServiceCore } from './BulkActionsServiceCore';

/**
 * Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * BulkActionsServiceCore. Always live, no ds.* toggle (CORMS-owned data/actions).
 *
 * Clearance is resolved from CORMS_UserRoles (the caller's own Role + ClearanceTier) via
 * resolveMyClearanceTierFromUserRoles — NOT from RecordsHub's getCurrentUser(), which never
 * populated clearanceTier and so collapsed every user (admins included) to tier 1. That made every
 * bulk action (Expedite, Mark read/unread, Delete drafts, Add to folder) silently no-op on any
 * item above Public/Unclassified: partitionByClearance dropped it, succeeded came back empty, and
 * the caller's `if (succeeded)` guard skipped the write, the audit and the timeline with no error.
 * This now matches CorrespondenceList/CorrespondenceDetail so an item the user can see they can act on.
 */
export class BulkActionsServiceLive implements IBulkActionsService {
  private readonly core: BulkActionsServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new BulkActionsServiceCore(sp, async () =>
      resolveMyClearanceTierFromUserRoles(sp, await getCurrentSiteUserId(sp))
    );
  }

  public markRead(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return this.core.markRead(correspondenceIds);
  }

  public markUnread(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return this.core.markUnread(correspondenceIds);
  }

  public expedite(correspondenceIds: string[], reason: string): Promise<IBulkActionResult> {
    return this.core.expedite(correspondenceIds, reason);
  }

  public removeExpedite(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return this.core.removeExpedite(correspondenceIds);
  }

  public deleteDrafts(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return this.core.deleteDrafts(correspondenceIds);
  }

  public addToFolder(folderId: string, correspondenceIds: string[]): Promise<IBulkActionResult> {
    return this.core.addToFolder(folderId, correspondenceIds);
  }
}
