import type { SPFI } from '@pnp/sp';
import { CorrespondenceStatus } from '../../models/ICorrespondence';
import {
  CorrespondenceValidationError,
  ICorrespondenceValidationError,
  ICreateCorrespondencePayload,
  ICreateCorrespondenceResult,
  IDraftEditData,
} from '../../models/ICorrespondencePayload';
import { INumberingService } from '../interfaces/INumberingService';
import { IPendingResponseFlag } from '../interfaces/ICorrespondenceService';
import {
  buildCorrespondenceRowForWrite,
  mapCorrespondenceRowToDraftForm,
  ICorrespondenceDraftRow,
  CORRESPONDENCE_DRAFT_EDIT_SELECT,
  CORRESPONDENCE_DRAFT_EDIT_EXPAND,
} from '../common/mapCorrespondenceRow';
import { getCurrentSiteUserId } from '../common/currentUserId';

const LIST_TITLE = 'CORMS_Correspondence';
const TIMELINE_LIST_TITLE = 'CORMS_Timeline';

/**
 * Pure CORMS_Correspondence write logic backing CorrespondenceService.create() (CMS-001) — see
 * provisioningCore.ts's file comment for why Core classes only `import type { SPFI }`.
 * CorrespondenceService.live.ts is the thin real wrapper.
 *
 * Email ingestion (AC2's "capture channel") is explicitly out of scope for this task — there is
 * no Power Automate/Graph mail-ingestion pipeline anywhere in the project yet.
 * TODO: email ingestion is a separate integration task (Power Automate + mail connector) — not
 * part of this backend task.
 *
 * Fax (AC2) needs no special handling here — per the HLD's confirmed no-fax-gateway assumption, a
 * faxed document is captured the same way as any other scanned/uploaded attachment; there is no
 * fax-specific code path in this service.
 */
export class CorrespondenceServiceCore {
  constructor(
    private readonly sp: SPFI,
    private readonly numberingService: INumberingService
  ) {}

  /** Reads a saved draft back into the Create Correspondence screen's fields (edit mode). Returns
   * undefined when the id doesn't resolve to a row, so the caller opens a blank form rather than
   * failing. */
  public async getDraftForEdit(id: string): Promise<IDraftEditData | undefined> {
    const idNum = Number(id);
    if (!idNum) return undefined;
    try {
      const row = (await this.sp.web.lists
        .getByTitle(LIST_TITLE)
        .items.getById(idNum)
        .select(...CORRESPONDENCE_DRAFT_EDIT_SELECT)
        .expand(...CORRESPONDENCE_DRAFT_EDIT_EXPAND)()) as ICorrespondenceDraftRow;
      return mapCorrespondenceRowToDraftForm(row);
    } catch {
      return undefined;
    }
  }

  public async create(
    payload: ICreateCorrespondencePayload,
    mode: 'draft' | 'submit'
  ): Promise<ICreateCorrespondenceResult> {
    // CMS-001 AC3, defense-in-depth: the client already never lets an Incoming item reach a
    // template (ComposeDocumentSection never renders template UI for Incoming) — this rejects a
    // payload that somehow still carries one.
    if (payload.direction === 'Incoming' && payload.templateReference) {
      throw new CorrespondenceValidationError([
        { field: 'templateReference', message: 'Incoming correspondence cannot reference a template.' },
      ]);
    }

    if (mode === 'submit') {
      const errors = this.validateForSubmit(payload);
      if (errors.length > 0) throw new CorrespondenceValidationError(errors);
    }

    const currentUserId = await getCurrentSiteUserId(this.sp);
    const senderId = await this.resolveSenderId(payload.senderId, currentUserId);
    const dateCreated = new Date().toISOString();

    let referenceNumber: string | undefined;
    let status: CorrespondenceStatus = 'Draft';
    // CMS-022 — a reply is threaded to its parent from the outset (draft or submit): it carries the
    // parent's chain id. A standalone item's chain is resolved at submission (chainId := its own
    // issued reference number). ThreadId is deliberately the controlled number, distinct from the
    // SharePoint item id (the "document" id) and any file-plan id (AC4/AC8).
    const isReply = !!payload.chainId;
    let threadId: string | undefined = payload.chainId;

    if (mode === 'submit') {
      if (isReply) {
        // CMS-022 AC1/AC4 — a reply inherits its chain and reuses the chain's ONE controlled number
        // held constant across the whole exchange, so no new number is issued.
        referenceNumber = payload.chainId;
        threadId = payload.chainId;
      } else {
        // CMS-004's Reference No. is auto-generated at submission. A brand-new correspondence starts
        // its own chain, whose identifier is that issued controlled number.
        const numberingResult = await this.numberingService.issueReferenceNumber({
          direction: payload.direction === 'Outgoing' ? 'Outgoing' : 'Incoming',
          originatingFunction: payload.originatingFunction,
          contentType: payload.contentType,
        });
        referenceNumber = numberingResult.referenceNumber;
        threadId = referenceNumber;
      }
      // An already-signed Outgoing document skips approval and signing entirely.
      status = payload.direction === 'Outgoing' && payload.mainDocumentSigned ? 'Signed' : 'Registered';
    }
    // Draft mode: no ReferenceNo consumed; a drafted reply still records its chain/parent so it's
    // already part of the thread, a drafted new item leaves threadId empty until submit.

    const row = buildCorrespondenceRowForWrite(
      payload,
      status,
      senderId,
      currentUserId, // AssignedTo defaults to the creator — routing/reassignment is a later epic.
      referenceNumber,
      dateCreated,
      threadId,
      payload.parentId
    );

    const list = this.sp.web.lists.getByTitle(LIST_TITLE);
    let id: number;
    const isNewItem = !payload.existingId;
    if (payload.existingId) {
      id = Number(payload.existingId);
      await list.items.getById(id).update(row);
    } else {
      const created = (await list.items.add(row)) as { Id: number };
      id = created.Id;
    }

    // CMS-040 Part 6 — Timeline write backfill: create() persisted the item but never pushed
    // CORMS_Timeline events, so the Detail screen's Timeline tab had nothing to show for a brand
    // new item. A logging failure must never fail the create() call itself.
    const idStr = String(id);
    if (isNewItem) {
      await this.writeTimelineEvent(
        idStr,
        'Created',
        currentUserId,
        dateCreated,
        'Correspondence created'
      ).catch(() => undefined);
    }
    if (mode === 'submit') {
      await this.writeTimelineEvent(
        idStr,
        'Submitted',
        currentUserId,
        dateCreated,
        'Submitted for review'
      ).catch(() => undefined);
      if (referenceNumber) {
        await this.writeTimelineEvent(
          idStr,
          'ReferenceAssigned',
          currentUserId,
          dateCreated,
          `Reference: ${referenceNumber}`
        ).catch(() => undefined);
      }
      if (status === 'Signed') {
        await this.writeTimelineEvent(
          idStr,
          'Signed',
          currentUserId,
          dateCreated,
          'Submitted with an already-signed main document — no approval required'
        ).catch(() => undefined);
      }
      // CMS-022 AC7 — a linked reply, once submitted, clears the parent's pending-response flag (a
      // response has now arrived) and backfills the parent's ThreadId so a chain that started before
      // this item is coherent. Non-fatal: the reply itself is already committed.
      if (isReply && payload.parentId && payload.chainId) {
        await this.linkParentOnReplySubmit(payload.parentId, payload.chainId).catch(() => undefined);
      }
    }

    return { id: idStr, status, referenceNumber, dateCreated };
  }

  /** A people picker yields either this web's user id or a stable login/claims key. Resolve the
   * latter through SharePoint's idempotent ensureUser so SenderId always receives a valid site user. */
  private async resolveSenderId(senderKey: string | undefined, fallback: number): Promise<number> {
    const raw = (senderKey ?? '').trim();
    if (!raw) return fallback;
    const numeric = Number(raw);
    if (Number.isInteger(numeric) && numeric > 0) return numeric;
    try {
      const ensured = (await this.sp.web.ensureUser(raw)) as { Id?: number; data?: { Id?: number } };
      return ensured.Id ?? ensured.data?.Id ?? fallback;
    } catch {
      return fallback;
    }
  }

  /** Backfills the parent's ThreadId (idempotent) and clears its pending-response flag when a reply
   * to it is submitted (CMS-022 AC7). */
  private async linkParentOnReplySubmit(parentId: string, chainId: string): Promise<void> {
    const idNum = Number(parentId);
    if (!idNum) return;
    await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.getById(idNum)
      .update({ ThreadId: chainId, PendingResponse: false });
  }

  /**
   * Sets or clears a correspondence's pending-response flag (CMS-014/CMS-022). Setting it stamps
   * the awaited party + flag time (PendingResponseFlaggedAt), which the AC4 escalation deadline is
   * measured from; clearing it blanks that detail. Callers that clear (or set without detail) keep
   * working — an undefined `flag` on a set still records the flag time.
   */
  public async setPendingResponse(id: string, pending: boolean, flag?: IPendingResponseFlag): Promise<void> {
    const idNum = Number(id);
    if (!idNum) return;
    const update: Record<string, unknown> = { PendingResponse: pending };
    if (pending) {
      update.PendingResponseParty = flag?.awaitedParty.name ?? '';
      update.PendingResponsePartyType = flag?.awaitedParty.type ?? 'Internal';
      update.PendingResponseFlaggedAt = new Date().toISOString();
      update.PendingResponseFlaggedBy = flag?.actor ?? '';
    } else {
      update.PendingResponseParty = '';
      update.PendingResponsePartyType = null;
      update.PendingResponseFlaggedAt = null;
      update.PendingResponseFlaggedBy = '';
    }
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(idNum).update(update);
  }

  private async writeTimelineEvent(
    correspondenceId: string,
    eventType: string,
    actorId: number,
    timestamp: string,
    description: string
  ): Promise<void> {
    await this.sp.web.lists.getByTitle(TIMELINE_LIST_TITLE).items.add({
      CorrespondenceId: correspondenceId,
      EventType: eventType,
      ActorId: actorId,
      Description: description,
      EventTimestamp: timestamp,
    });
  }

  // Mirrors the client's validateForSend (createCorrespondence/state/validateForm.ts) so the same
  // rule is enforced server-side too, not just as a client-side convenience.
  private validateForSubmit(payload: ICreateCorrespondencePayload): ICorrespondenceValidationError[] {
    const errors: ICorrespondenceValidationError[] = [];

    if (!payload.subject?.trim()) errors.push({ field: 'subject', message: 'Subject is required.' });
    if (!payload.sender?.trim()) errors.push({ field: 'sender', message: 'Sender is required.' });
    if (!payload.recipient?.trim()) errors.push({ field: 'recipient', message: 'Recipient is required.' });
    if (!payload.securityTier) errors.push({ field: 'securityTier', message: 'Security level is required.' });

    // CMS-043: at least one department (Internal) or organization (External) required to submit —
    // draft mode allows an empty destination.
    if (payload.destinationType === 'Internal' && (payload.destinationDepartments ?? []).length === 0) {
      errors.push({ field: 'destination', message: 'At least one destination department is required.' });
    }
    if (payload.destinationType === 'External' && (payload.externalOrganizations ?? []).length === 0) {
      errors.push({ field: 'destination', message: 'At least one external organization is required.' });
    }

    return errors;
  }
}
