import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import '@pnp/sp/folders';
import '@pnp/sp/files';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IDirectoryPerson } from '../../models/IDelegation';
import {
  ICreateDelegationInput,
  IDelegationLedgerEntry,
  IDelegationLedgerFilters,
  IDelegationListFilters,
  IDelegationRecord,
  IDelegationAuditSummaryRow,
  IDelegationService,
} from '../interfaces/IDelegationService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { libraryRootServerRelativePath, toUploadBlob } from '../common/spFileUpload';
import { DelegationServiceCore, IDelegationAttachmentUploadSurface } from './DelegationServiceCore';

const LIBRARY_TITLE = 'CORMS_DelegationAttachments';

/** Real `@pnp/sp` implementation of IDelegationAttachmentUploadSurface — the only place in this
 * module that touches PnPjs's file/folder API directly, so DelegationServiceCore stays fully
 * unit-testable without it (mirrors AttachmentStorageService.live.ts's PnpFolderFileSurface). */
class PnpDelegationAttachmentUploadSurface implements IDelegationAttachmentUploadSurface {
  private readonly libraryRootPath: string;

  constructor(private readonly sp: SPFI, siteUrl: string) {
    this.libraryRootPath = libraryRootServerRelativePath(siteUrl, LIBRARY_TITLE);
  }

  public async uploadFile(fileName: string, content: Blob | ArrayBuffer): Promise<number> {
    const folder = this.sp.web.getFolderByServerRelativePath(this.libraryRootPath);
    const uploaded = await folder.files.addChunked(fileName, toUploadBlob(content));
    const item = await this.sp.web.getFileByServerRelativePath(uploaded.ServerRelativeUrl).getItem<{ Id: number }>('Id');
    return item.Id;
  }
}

/** Thin real wrapper around DelegationServiceCore (CMS-017). The shared audit service is injected
 * so delegation events use the same Elasticsearch index and configuration as every other event. */
export class DelegationServiceLive implements IDelegationService {
  private readonly core: DelegationServiceCore;

  constructor(
    context: WebPartContext,
    siteUrl: string,
    auditTrailService: IAuditTrailService,
    spOverride?: SPFI
  ) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    const attachmentUploadSurface = new PnpDelegationAttachmentUploadSurface(sp, siteUrl);
    this.core = new DelegationServiceCore(sp, auditTrailService, attachmentUploadSurface);
  }

  public create(input: ICreateDelegationInput): Promise<IDelegationRecord> {
    return this.core.create(input);
  }

  public revoke(delegationId: string, reason: string): Promise<void> {
    return this.core.revoke(delegationId, reason);
  }

  public listMine(filters?: IDelegationListFilters): Promise<IDelegationRecord[]> {
    return this.core.listMine(filters);
  }

  public listAll(filters?: IDelegationListFilters): Promise<IDelegationRecord[]> {
    return this.core.listAll(filters);
  }

  public getAuditSummary(): Promise<IDelegationAuditSummaryRow[]> {
    return this.core.getAuditSummary();
  }

  public getDelegationLedger(userId: string, filters?: IDelegationLedgerFilters): Promise<IDelegationLedgerEntry[]> {
    return this.core.getDelegationLedger(userId, filters);
  }

  public listDirectory(): Promise<IDirectoryPerson[]> {
    return this.core.listDirectory();
  }

  public getMyDirectoryId(): Promise<string> {
    return this.core.getMyDirectoryId();
  }
}
