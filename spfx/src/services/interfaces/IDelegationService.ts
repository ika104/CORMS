import { IDirectoryPerson } from '../../models/IDelegation';

/**
 * Delegation & Reassignment Backend task (CMS-017) — live/mock backing for the Delegation
 * Management screen (self-service + admin-created delegations, revoke, ledger/audit summary) and
 * the delegate-picker directory it shares with Team Inbox. See DelegationServiceCore.ts's file
 * comment for the create()/revoke() authorization rules this interface's implementations enforce.
 */
export interface ICreateDelegationInput {
  /** String SharePoint user id. Only honored as given when `isAdmin` is true and the caller is
   * confirmed SystemAdministrator server-side — otherwise ignored entirely and re-derived as the
   * acting user (see DelegationServiceCore.create), so a self-service caller may pass ''. */
  delegator: string;
  delegate: string;
  reason: string;
  /** ISO date. */
  startDate: string;
  /** ISO date. */
  endDate: string;
  isAdmin: boolean;
  /** fileType is validated server-side against the 5-value CORMS_DelegationAttachments.FileType
   * set (PDF/DOCX/XLSX/PNG/JPG). CORMS_DelegationAttachments is a Document Library
   * (listSchemas.ts's DECISION comment), so `content` is real, required file bytes — DelegationService
   * uploads them via SharePoint's file API, not a metadata-only list-item write. */
  attachments: { fileName: string; fileType: string; content: Blob | ArrayBuffer }[];
}

export interface IDelegationRecord {
  id: string;
  delegatorId: string;
  delegatorName: string;
  delegateId: string;
  delegateName: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Pending' | 'Rejected' | 'Revoked';
  createdBy: string;
}

export interface IDelegationAttachmentRecord {
  id: string;
  delegationId: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface IDelegationAuditSummaryRow {
  userId: string;
  userName: string;
  team: string;
  totalCreated: number;
  /** Count of this user's delegations that reached Active status. */
  accepted: number;
  /** Expected to trend toward 0 given the no-approval decision (see DelegationServiceCore.create) —
   * the creation path never produces a Rejected row; kept only for historical/legacy data. */
  rejected: number;
  revoked: number;
}

export interface IDelegationLedgerEntry extends IDelegationRecord {
  attachments: IDelegationAttachmentRecord[];
}

export interface IDelegationListFilters {
  search?: string;
}

export interface IDelegationLedgerFilters {
  search?: string;
  team?: string;
}

export interface IDelegationService {
  create(input: ICreateDelegationInput): Promise<IDelegationRecord>;
  revoke(delegationId: string, reason: string): Promise<void>;
  /** Delegations created *by the signed-in user*. Takes no user id on purpose: the acting identity
   * is resolved server-side against CORMS's own site (getCurrentSiteUserId), the same rule
   * create()/revoke() already follow — a caller-supplied id would be both spoofable and, coming
   * from the UI, the wrong site collection's id (IUser.id is RecordsHub-scoped). */
  listMine(filters?: IDelegationListFilters): Promise<IDelegationRecord[]>;
  listAll(filters?: IDelegationListFilters): Promise<IDelegationRecord[]>;
  getAuditSummary(): Promise<IDelegationAuditSummaryRow[]>;
  /** Unlike listMine()/listAll(), this one still takes an explicit `userId` — it's meant to drill
   * into any one user's ledger (an admin use case), not just "my own" — but the acting caller is
   * still authorized server-side: reading your own ledger is always allowed, reading someone
   * else's requires being a confirmed SystemAdministrator (see DelegationServiceCore.getDelegationLedger). */
  getDelegationLedger(userId: string, filters?: IDelegationLedgerFilters): Promise<IDelegationLedgerEntry[]>;
  listDirectory(): Promise<IDirectoryPerson[]>;
  /** The signed-in user's own directory id — lets a caller (CreateDelegationModal's self-service
   * "Delegate To" picker) reliably exclude "myself" from a list of IDirectoryPerson by id, instead
   * of comparing display names across site collections. See DelegationServiceCore.getMyDirectoryId
   * for why display-name comparison isn't reliable here. */
  getMyDirectoryId(): Promise<string>;
}
