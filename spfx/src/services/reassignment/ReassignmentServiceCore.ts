import type { SPFI } from '@pnp/sp';
import { IDirectoryPerson } from '../../models/IDelegation';
import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { IReassignInput } from '../interfaces/IReassignmentService';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { isWithinClearance, securityLevelToTier } from '../common/clearance';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';
const TIMELINE_LIST_TITLE = 'CORMS_Timeline';

interface ICorrespondenceSecurityRow {
  SecurityLevel?: string;
}

/**
 * Pure CMS-019 reassignment logic — see provisioningCore.ts's file comment for why Core classes
 * only `import type { SPFI }`. ReassignmentService.live.ts is the thin real wrapper.
 *
 * Both orgHierarchyService and auditTrailService are injected rather than constructed here, so
 * this class stays testable against hand-rolled fakes (see __tests__/ReassignmentServiceCore.test.ts)
 * while ReassignmentService.live.ts wires in the real OrgHierarchyServiceLive/AuditTrailServiceLive.
 *
 * Every gate below is re-validated unconditionally — never trusted from the caller's payload —
 * since a caller could construct this class directly and skip whatever candidate filtering the UI
 * already applied. That includes *who the supervisor is*: the acting supervisor is resolved from
 * the signed-in identity, so naming someone else's supervisor in the input can't grant access to
 * their team's work. Any gate can independently reject the reassignment.
 */
export class ReassignmentServiceCore {
  constructor(
    private readonly sp: SPFI,
    private readonly orgHierarchyService: IOrgHierarchyService,
    private readonly auditTrailService: IAuditTrailService
  ) {}

  public async reassign(input: IReassignInput): Promise<void> {
    const correspondenceIdNum = Number(input.correspondenceId);
    const supervisorId = String(await getCurrentSiteUserId(this.sp));

    // 1 & 2's reads are independent of each other — the direct-reports lookup doesn't need the
    // item's SecurityLevel, and reading SecurityLevel doesn't need the direct-reports result — so
    // both are issued together rather than serialized. (One SecurityLevel read is spent even on the
    // rejection path below, in exchange for one fewer round trip end-to-end on the far more common
    // success path.)
    const [directReports, securityRow] = await Promise.all([
      this.orgHierarchyService.getDirectReports(supervisorId),
      this.sp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(correspondenceIdNum).select('SecurityLevel')() as Promise<ICorrespondenceSecurityRow>,
    ]);

    // 1. Both-direct-reports validation — fromUserId and toUserId must both genuinely be direct
    // reports of the *acting* supervisor per CORMS_UserRoles.ManagerUser (via IOrgHierarchyService).
    const reportsById = new Map<string, IDirectoryPerson>(directReports.map((p) => [p.id, p]));
    const toUser = reportsById.get(input.toUserId);
    if (!reportsById.has(input.fromUserId) || !toUser) {
      throw new Error('Reassignment rejected: both users must be your own direct reports.');
    }

    // 2. Clearance check — the new assignee's resolved clearance tier must be at or above the
    // item's own SecurityLevel tier. Their tier comes from the IDirectoryPerson resolved above
    // (IOrgHierarchyService reads it from the same CORMS_UserRoles.ClearanceTier column), so this
    // gate costs no second lookup of a row the direct-reports query already returned.
    const itemTier = securityLevelToTier(securityRow?.SecurityLevel);

    if (!isWithinClearance(itemTier, toUser.clearanceTier)) {
      throw new Error('Reassignment rejected: the selected recipient does not have sufficient clearance for this item.');
    }

    // 3. Reassign — update AssignedTo. Deliberately no CORMS_ReadReceipts row is written for the
    // new assignee (AC4): the item genuinely shows as unread in their inbox, matching the "no
    // existing read receipt = unread" rule everywhere else in this codebase.
    await this.sp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(correspondenceIdNum).update({
      AssignedToId: Number(input.toUserId),
    });

    // TODO: real-time push/email notification on reassignment is a Power Automate/email concern,
    // out of scope for this SPFx/SharePoint-only task. The item surfacing as unread in the new
    // assignee's inbox (no CORMS_ReadReceipts row written here) is the in-app equivalent
    // implemented here.

    // 4. Audit — logged after the reassignment succeeds. A logging failure must never block the
    // reassignment itself (mirrors CorrespondenceDetailServiceCore.logView's precedent), but is
    // still awaited so tests can assert the audit entry exists once reassign() resolves.
    const nowIso = new Date().toISOString();
    await this.auditTrailService
      .logEvent({
        objectId: input.correspondenceId,
        actor: '',
        action: 'Correspondence Reassigned',
        details: JSON.stringify({
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          supervisorId,
          reason: input.reason,
          timestamp: nowIso,
        }),
        timestamp: nowIso,
      })
      .catch(() => undefined);

    // CMS-040 Part 6 — Timeline write backfill: reassignment previously wrote only to
    // audit event, so the Detail screen's Timeline tab had no record of it at all. A logging
    // failure must never block the reassignment itself, same posture as the audit write above.
    await this.sp.web.lists
      .getByTitle(TIMELINE_LIST_TITLE)
      .items.add({
        CorrespondenceId: input.correspondenceId,
        EventType: 'Reassigned',
        ActorId: Number(supervisorId),
        Description: `Reassigned from ${input.fromUserId} to ${input.toUserId}${input.reason ? ` — ${input.reason}` : ''}`,
        EventTimestamp: nowIso,
      })
      .catch(() => undefined);
  }
}
