import type { SPFI } from '@pnp/sp';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { IRouteInput } from '../interfaces/IRoutingService';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { mapStatusToListValue } from '../common/mapCorrespondenceRow';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';
const TIMELINE_LIST_TITLE = 'CORMS_Timeline';

/**
 * Pure CMS-011 routing logic — see provisioningCore.ts's file comment for why Core classes only
 * `import type { SPFI }`. RoutingService.live.ts is the thin real wrapper.
 *
 * Mirrors ReassignmentServiceCore's shape: persist the decision on CORMS_Correspondence, then log
 * an attributed, timestamped audit entry that must never block the routing itself. The item is
 * advanced to 'In Review' so it leaves the triage (Registered) queue (AC8); a department recipient
 * becomes CurrentDepartment and an individual becomes the primary assignee (AssignedTo), while the
 * complete recipient set is kept as JSON in RoutedRecipients since one item cannot hold many
 * assignees. No CORMS_ReadReceipts row is written for the recipients, so the item genuinely shows
 * as unread in their inbox — the in-app equivalent of the AC7 notification; real push/email is a
 * Power Automate concern out of scope here.
 */
export class RoutingServiceCore {
  constructor(
    private readonly sp: SPFI,
    private readonly auditTrailService: IAuditTrailService
  ) {}

  /** Resolves a routing recipient's id to a numeric SharePoint user id for AssignedToId. A numeric
   * id is used as-is; a people-picker login key (e.g. i:0#.f|membership|user@tenant) is resolved via
   * ensureUser. Returns undefined on any failure, so an unresolvable individual leaves the item
   * unassigned rather than failing the route. */
  private async resolveAssigneeId(recipientId: string): Promise<number | undefined> {
    if (/^\d+$/.test(recipientId)) return Number(recipientId);
    try {
      const ensured = (await this.sp.web.ensureUser(recipientId)) as { Id?: number; data?: { Id?: number } };
      const id = ensured.Id ?? ensured.data?.Id;
      return typeof id === 'number' ? id : undefined;
    } catch {
      return undefined;
    }
  }

  public async route(input: IRouteInput): Promise<void> {
    const correspondenceIdNum = Number(input.correspondenceId);
    const actorId = String(await getCurrentSiteUserId(this.sp));
    const nowIso = new Date().toISOString();

    const department = input.recipients.find((r) => r.kind === 'department');
    const user = input.recipients.find((r) => r.kind === 'user');

    const update: Record<string, unknown> = {
      NextAction: input.nextAction,
      RoutedBy: actorId,
      RoutedAt: nowIso,
      RoutedRecipients: JSON.stringify(input.recipients),
      Status: mapStatusToListValue('InReview'),
    };
    if (department) update.CurrentDepartment = department.name;
    // An individual recipient becomes the primary assignee (a department routes via
    // CurrentDepartment instead — no single user to assign to). The people picker supplies a login
    // key, not a numeric id, so resolve it to a SharePoint user id via ensureUser; a value that is
    // already numeric is used directly. A resolution failure leaves the item unassigned rather than
    // failing the whole route.
    const assigneeId = user ? await this.resolveAssigneeId(user.id) : undefined;
    if (assigneeId !== undefined) update.AssignedToId = assigneeId;

    await this.sp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(correspondenceIdNum).update(update);

    // AC6 — audit after the routing succeeds; a logging failure must never block the routing
    // (mirrors ReassignmentServiceCore). `actor: ''` lets the audit service resolve the acting
    // identity itself, as reassignment does.
    await this.auditTrailService
      .logEvent({
        objectId: input.correspondenceId,
        actor: '',
        action: 'Correspondence Routed',
        details: JSON.stringify({
          recipients: input.recipients,
          nextAction: input.nextAction,
          matrixApplied: !!input.matrixApplied,
          routedBy: actorId,
          timestamp: nowIso,
        }),
        timestamp: nowIso,
      })
      .catch(() => undefined);

    await this.sp.web.lists
      .getByTitle(TIMELINE_LIST_TITLE)
      .items.add({
        CorrespondenceId: input.correspondenceId,
        EventType: 'Routed',
        ActorId: Number(actorId),
        Description: `Routed to ${input.recipients.map((r) => r.name).join(', ')} — next step: ${input.nextAction}`,
        EventTimestamp: nowIso,
      })
      .catch(() => undefined);
  }
}
