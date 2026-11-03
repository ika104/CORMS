import type { SPFI } from '@pnp/sp';
import { IApplyClassificationInput, IClassificationService } from '../interfaces/IClassificationService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { tierToSecurityLevel } from '../common/clearance';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';
const TIMELINE_LIST_TITLE = 'CORMS_Timeline';

/**
 * Pure CMS-010 classify/amend persistence — see provisioningCore.ts's file comment for why Core
 * classes only `import type { SPFI }`. ClassificationService.live.ts is the thin real wrapper.
 *
 * Mirrors RoutingServiceCore: persist the officer's decision on CORMS_Correspondence, then log an
 * attributed, timestamped audit entry (with before/after values + the AC9 reason) that must never
 * block the change itself. Only fields the caller actually set are written, so an unset field never
 * clears a captured value. A Timeline 'Edited' row records the event for the detail Timeline tab.
 */
export class ClassificationServiceCore implements IClassificationService {
  constructor(
    private readonly sp: SPFI,
    private readonly auditTrailService: IAuditTrailService
  ) {}

  public async applyClassification(input: IApplyClassificationInput): Promise<void> {
    const idNum = Number(input.correspondenceId);
    const actorId = String(await getCurrentSiteUserId(this.sp));
    const nowIso = new Date().toISOString();

    const update: Record<string, unknown> = {};
    if (input.contentType !== undefined) update.ContentTypeName = input.contentType;
    if (input.priority !== undefined) update.Priority = input.priority;
    if (input.securityTier !== undefined) {
      const level = tierToSecurityLevel(input.securityTier);
      if (level !== undefined) update.SecurityLevel = level;
    }
    if (input.recordClassification !== undefined) update.RecordClassification = input.recordClassification;
    // A blank deadline clears DueDate; a set one writes it (SharePoint parses the yyyy-mm-dd string).
    if (input.responseDeadline !== undefined) update.DueDate = input.responseDeadline || null;

    // The persistence write is the point of this call — NOT best-effort. A failure rejects so the
    // caller can surface it (unlike the audit/timeline below). Skip only when there is genuinely
    // nothing to persist.
    if (Object.keys(update).length > 0) {
      await this.sp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(idNum).update(update);
    }

    // AC5/AC9 — the mandatory before/after audit entry. `actor: ''` lets the audit service resolve
    // the acting identity itself, mirroring RoutingServiceCore. Best-effort: a logging failure must
    // never undo or block a change that already persisted.
    await this.auditTrailService
      .logEvent({
        objectId: input.correspondenceId,
        actor: '',
        action: input.action,
        details: input.auditDetails,
        timestamp: nowIso,
      })
      .catch(() => undefined);

    await this.sp.web.lists
      .getByTitle(TIMELINE_LIST_TITLE)
      .items.add({
        CorrespondenceId: input.correspondenceId,
        EventType: 'Edited',
        ActorId: Number(actorId),
        Description: input.summary,
        EventTimestamp: nowIso,
      })
      .catch(() => undefined);
  }
}
