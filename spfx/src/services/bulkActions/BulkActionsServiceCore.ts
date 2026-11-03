import type { SPFI } from '@pnp/sp';
import { CormsRole } from '../../models/ICormsRole';
import { BulkActionForbiddenError, IBulkActionResult } from '../interfaces/IBulkActionsService';
import { isWithinClearance, securityLevelToTier } from '../common/clearance';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { RoleServiceCore } from '../role/RoleServiceCore';
import { ReadReceiptServiceCore } from '../readReceipts/ReadReceiptServiceCore';
import { CustomFolderServiceCore } from '../folders/CustomFolderServiceCore';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';
const TIMELINE_LIST_TITLE = 'CORMS_Timeline';

// CMS-057 AC4 — only these roles may Expedite. Checked once for the whole call (throws), before
// any per-item clearance check runs (which only ever drops individual ids, never the whole call).
const EXPEDITE_ALLOWED_ROLES: CormsRole[] = ['DocumentControl', 'SupervisorManager', 'SystemAdministrator'];

interface ISecurityLevelRow {
  Id: number;
  SecurityLevel?: string;
  Status?: string;
}

/**
 * Pure CMS-057 bulk-action logic — see provisioningCore.ts's file comment for why Core classes
 * only `import type { SPFI }`. BulkActionsService.live.ts is the thin real wrapper.
 *
 * Every method re-validates clearance per targeted id via partitionByClearance() before acting
 * (AC8) — an id that resolves to a row above the current user's clearance (or doesn't resolve to
 * a real row at all) is silently dropped into `rejected` rather than trusted because the client
 * sent it. Composes the other Epic 1 Core classes directly (RoleServiceCore,
 * ReadReceiptServiceCore, CustomFolderServiceCore) since they all share the same injected `sp` —
 * never a second implementation of role resolution, read-receipt batching, or pin logic.
 */
export class BulkActionsServiceCore {
  private readonly roleService: RoleServiceCore;
  private readonly readReceipts: ReadReceiptServiceCore;
  private readonly folders: CustomFolderServiceCore;

  constructor(
    private readonly sp: SPFI,
    private readonly getCurrentUserClearanceTier: () => Promise<number>
  ) {
    this.roleService = new RoleServiceCore(sp);
    this.readReceipts = new ReadReceiptServiceCore(sp);
    this.folders = new CustomFolderServiceCore(sp);
  }

  public async markRead(correspondenceIds: string[]): Promise<IBulkActionResult> {
    const { allowedIds, rejectedIds } = await this.partitionByClearance(correspondenceIds);
    await this.readReceipts.markRead(allowedIds);
    return { succeeded: allowedIds, rejected: rejectedIds };
  }

  public async markUnread(correspondenceIds: string[]): Promise<IBulkActionResult> {
    const { allowedIds, rejectedIds } = await this.partitionByClearance(correspondenceIds);
    await this.readReceipts.markUnread(allowedIds);
    return { succeeded: allowedIds, rejected: rejectedIds };
  }

  public async expedite(correspondenceIds: string[], reason: string): Promise<IBulkActionResult> {
    const { role } = await this.roleService.getCurrentUserRole();
    if (EXPEDITE_ALLOWED_ROLES.indexOf(role) === -1) {
      throw new BulkActionForbiddenError('expedite correspondence');
    }

    const { allowedIds, rejectedIds } = await this.partitionByClearance(correspondenceIds);
    if (allowedIds.length > 0) {
      const currentUserId = await getCurrentSiteUserId(this.sp);
      const nowIso = new Date().toISOString();
      const [batchedSp, execute] = this.sp.batched();
      allowedIds.forEach((id) => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
        batchedSp.web.lists
          .getByTitle(CORRESPONDENCE_LIST_TITLE)
          .items.getById(Number(id))
          .update({
            ExpeditedFlag: true,
            ExpeditedReason: reason,
            ExpeditedById: currentUserId,
            ExpeditedAt: nowIso,
            // Matches the pre-existing (mock) bulk Expedite behavior — see IExpediteDetail's
            // model comment: Expedite also sets Priority High, distinct from the two concerns
            // being tracked separately.
            Priority: 'High',
          });
      });
      await execute();
      // CMS-040 Part 6 — Timeline write backfill: Expedite had real backend already (EPIC 14) but
      // never pushed a CORMS_Timeline event, so the Detail screen's Timeline tab had nothing to
      // show for it.
      await this.writeExpeditedTimelineEvents(allowedIds, reason, currentUserId, nowIso);
    }
    return { succeeded: allowedIds, rejected: rejectedIds };
  }

  // CMS-015 AC6 — lift the expedite flag on each item, persisted server-side. Same role gate as
  // expedite (AC1) and the same per-item clearance partition. Clears the four Expedited* columns and
  // writes an 'ExpediteRemoved' Timeline event so the Detail screen's Timeline reflects the removal
  // (the caller additionally writes the Elasticsearch audit event via auditTrailService). Priority is left
  // untouched: expedite raised it to High but the prior value wasn't retained, so removal lifts the
  // flag rather than guessing a new priority.
  public async removeExpedite(correspondenceIds: string[]): Promise<IBulkActionResult> {
    const { role } = await this.roleService.getCurrentUserRole();
    if (EXPEDITE_ALLOWED_ROLES.indexOf(role) === -1) {
      throw new BulkActionForbiddenError('remove the expedite flag');
    }

    const { allowedIds, rejectedIds } = await this.partitionByClearance(correspondenceIds);
    if (allowedIds.length > 0) {
      const currentUserId = await getCurrentSiteUserId(this.sp);
      const nowIso = new Date().toISOString();
      const [batchedSp, execute] = this.sp.batched();
      allowedIds.forEach((id) => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
        batchedSp.web.lists
          .getByTitle(CORRESPONDENCE_LIST_TITLE)
          .items.getById(Number(id))
          .update({ ExpeditedFlag: false, ExpeditedReason: '', ExpeditedById: null, ExpeditedAt: null });
      });
      await execute();
      await this.writeExpediteRemovedTimelineEvents(allowedIds, currentUserId, nowIso);
    }
    return { succeeded: allowedIds, rejected: rejectedIds };
  }

  private async writeExpeditedTimelineEvents(ids: string[], reason: string, actorId: number, timestamp: string): Promise<void> {
    if (ids.length === 0) return;
    const [batchedSp, execute] = this.sp.batched();
    ids.forEach((id) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
      batchedSp.web.lists.getByTitle(TIMELINE_LIST_TITLE).items.add({
        CorrespondenceId: id,
        EventType: 'Expedited',
        ActorId: actorId,
        Description: `Item expedited — ${reason}`,
        EventTimestamp: timestamp,
      });
    });
    await execute();
  }

  private async writeExpediteRemovedTimelineEvents(ids: string[], actorId: number, timestamp: string): Promise<void> {
    if (ids.length === 0) return;
    const [batchedSp, execute] = this.sp.batched();
    ids.forEach((id) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
      batchedSp.web.lists.getByTitle(TIMELINE_LIST_TITLE).items.add({
        CorrespondenceId: id,
        EventType: 'ExpediteRemoved',
        ActorId: actorId,
        Description: 'Expedite flag removed',
        EventTimestamp: timestamp,
      });
    });
    await execute();
  }

  // The UI only ever offers this action from a Drafts context, but that's a client-side
  // affordance, not something the server can trust — re-checks Status = Draft here too (the same
  // "never trust the client" posture as the clearance check below), so a manipulated request
  // naming a non-draft id is dropped into `rejected` rather than deleting a real correspondence
  // item.
  public async deleteDrafts(correspondenceIds: string[]): Promise<IBulkActionResult> {
    const { allowedIds: clearanceAllowedIds, rejectedIds: clearanceRejectedIds, rowsById } =
      await this.partitionByClearance(correspondenceIds);

    const allowedIds: string[] = [];
    const rejectedIds: string[] = [...clearanceRejectedIds];
    clearanceAllowedIds.forEach((id) => {
      if (rowsById.get(id)?.Status === 'Draft') {
        allowedIds.push(id);
      } else {
        rejectedIds.push(id);
      }
    });

    if (allowedIds.length > 0) {
      const [batchedSp, execute] = this.sp.batched();
      allowedIds.forEach((id) => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
        batchedSp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(Number(id)).delete();
      });
      await execute();
    }
    return { succeeded: allowedIds, rejected: rejectedIds };
  }

  // Reuses CustomFolderServiceCore.pinItems' own single union write (already one request, with
  // its own ETag-conflict retry) rather than looping a batched call per item — strictly fewer
  // requests for the same correctness guarantee. Deliberate deviation from the task's literal
  // "once per selected item, batched" phrasing; flagged rather than silently decided.
  public async addToFolder(folderId: string, correspondenceIds: string[]): Promise<IBulkActionResult> {
    const { allowedIds, rejectedIds } = await this.partitionByClearance(correspondenceIds);
    if (allowedIds.length > 0) {
      await this.folders.pinItems(folderId, allowedIds);
    }
    return { succeeded: allowedIds, rejected: rejectedIds };
  }

  private async partitionByClearance(
    ids: string[]
  ): Promise<{ allowedIds: string[]; rejectedIds: string[]; rowsById: Map<string, ISecurityLevelRow> }> {
    if (ids.length === 0) return { allowedIds: [], rejectedIds: [], rowsById: new Map() };
    const clearanceTier = await this.getCurrentUserClearanceTier();
    const idClause = ids.map((id) => `Id eq ${Number(id)}`).join(' or ');
    const rows = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.filter(idClause)
      .select('Id', 'SecurityLevel', 'Status')()) as ISecurityLevelRow[];
    const rowsById = new Map(rows.map((r) => [String(r.Id), r]));

    const allowedIds: string[] = [];
    const rejectedIds: string[] = [];
    ids.forEach((id) => {
      const row = rowsById.get(id);
      // An id that doesn't resolve to a real row at all is dropped too — never trusted just
      // because the client sent it.
      if (row && isWithinClearance(securityLevelToTier(row.SecurityLevel), clearanceTier)) {
        allowedIds.push(id);
      } else {
        rejectedIds.push(id);
      }
    });
    return { allowedIds, rejectedIds, rowsById };
  }
}
