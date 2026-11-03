import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import '@pnp/sp/security/item';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  CorrespondenceDetailResult,
  ICorrespondenceDetailService,
  IDetailFieldPatch,
  TabResult,
} from '../interfaces/ICorrespondenceDetailService';
import { CorrespondenceStatus, ICorrespondenceStub } from '../../models/ICorrespondence';
import { IAnnotationItem } from '../../models/IGroupDocs';
import {
  IAttachmentsResult,
  IAuditEntry,
  IDeclarationResult,
  IReminder,
  ISecurityPrincipal,
  ITimelineEvent,
} from '../../models/ICorrespondenceDetail';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { resolveMyClearanceTierFromUserRoles } from '../common/mapUserRoleRow';
import { AttachmentStorageServiceCore } from '../attachments/AttachmentStorageServiceCore';
import { PnpFolderFileSurface } from '../attachments/AttachmentStorageService.live';
import { PnpAttachmentContentSurface } from '../attachments/AttachmentService.live';
import { CorrespondenceDetailServiceCore } from './CorrespondenceDetailServiceCore';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';

/** Thin wrapper — builds the real PnPjs SPFI against CORMS's own site. Always live, no ds.*
 * toggle (CORMS-owned data). Builds its own AttachmentStorageServiceCore (same real folder/file
 * logic AttachmentStorageService.live.ts uses) so getAttachments can resolve each attachment's
 * real serverRelativeUrl without threading a second service instance through bootstrap.ts.
 *
 * CMS-040 DECISION: unlike every other Epic 1 live service, this one resolves the *signed-in*
 * user's clearance tier from CORMS_UserRoles.ClearanceTier directly (via
 * getMyClearanceTierFromUserRoles), not from RecordsHub's getCurrentUser(). CORMS_UserRoles
 * already carries this column for every other user (added by the Delegation & Reassignment task),
 * so reading it for the caller's own row too removes a RecordsHub round trip this one service
 * doesn't otherwise need — and RecordsHub's site URL was still an unset placeholder
 * (`TODO-CONFIRM.sharepoint.com`) in real-tenant testing, breaking this screen for a reason that
 * has nothing to do with anything CORMS itself owns. Deliberately narrow: every other Epic 1 live
 * service (CorrespondenceListServiceCore, BulkActionsServiceCore, CustomFolderServiceCore, ...)
 * still resolves clearance via RecordsHub (see clearance.ts's file comment) — migrating all of
 * them is a separate, bigger decision, not part of this task. */
export class CorrespondenceDetailServiceLive implements ICorrespondenceDetailService {
  private readonly core: CorrespondenceDetailServiceCore;

  constructor(
    context: WebPartContext,
    siteUrl: string,
    auditTrailService: IAuditTrailService,
    spOverride?: SPFI
  ) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    const attachmentStorage = new AttachmentStorageServiceCore(new PnpFolderFileSurface(sp, siteUrl));
    this.core = new CorrespondenceDetailServiceCore(
      sp,
      async () => {
        const currentUserId = await getCurrentSiteUserId(sp);
        return resolveMyClearanceTierFromUserRoles(sp, currentUserId);
      },
      auditTrailService,
      undefined,
      attachmentStorage,
      new PnpAttachmentContentSurface(sp, siteUrl)
    );
  }

  public saveSignedMainDocument(id: string, signedPdf: Blob): Promise<TabResult<string>> {
    return this.core.saveSignedMainDocument(id, signedPdf);
  }

  public getDetail(id: string): Promise<CorrespondenceDetailResult> {
    return this.core.getDetail(id);
  }

  public getAttachments(id: string): Promise<TabResult<IAttachmentsResult>> {
    return this.core.getAttachments(id);
  }

  public getSecurityAssignments(id: string): Promise<TabResult<ISecurityPrincipal[]>> {
    return this.core.getSecurityAssignments(id);
  }

  public getAuditTrail(id: string): Promise<TabResult<IAuditEntry[]>> {
    return this.core.getAuditTrail(id);
  }

  public getTimeline(id: string): Promise<TabResult<ITimelineEvent[]>> {
    return this.core.getTimeline(id);
  }

  public getThread(id: string, chainId: string): Promise<TabResult<ICorrespondenceStub[]>> {
    return this.core.getThread(id, chainId);
  }

  public getReminder(id: string): Promise<TabResult<IReminder | undefined>> {
    return this.core.getReminder(id);
  }

  public saveReminder(id: string, reminder: IReminder): Promise<TabResult<void>> {
    return this.core.saveReminder(id, reminder);
  }

  public clearReminder(id: string): Promise<TabResult<void>> {
    return this.core.clearReminder(id);
  }

  public declareRecord(id: string, declaredBy: string): Promise<TabResult<IDeclarationResult>> {
    return this.core.declareRecord(id, declaredBy);
  }

  public getAnnotations(id: string): Promise<TabResult<IAnnotationItem[]>> {
    return this.core.getAnnotations(id);
  }

  public saveAnnotations(id: string, annotations: IAnnotationItem[]): Promise<TabResult<void>> {
    return this.core.saveAnnotations(id, annotations);
  }

  public setStatus(id: string, status: CorrespondenceStatus): Promise<TabResult<void>> {
    return this.core.setStatus(id, status);
  }

  public addTimelineEntry(id: string, eventType: string, description: string): Promise<TabResult<void>> {
    return this.core.addTimelineEntry(id, eventType, description);
  }

  public updateDetails(
    id: string,
    patch: IDetailFieldPatch,
    changeComment: string
  ): Promise<TabResult<void>> {
    return this.core.updateDetails(id, patch, changeComment);
  }

  public logView(correspondenceId: string, action: string, details: string): Promise<void> {
    return this.core.logView(correspondenceId, action, details);
  }
}
