import type { SPFI } from '@pnp/sp';
import { IDirectoryPerson } from '../../models/IDelegation';
import {
  ICreateDelegationInput,
  IDelegationAttachmentRecord,
  IDelegationAuditSummaryRow,
  IDelegationLedgerEntry,
  IDelegationLedgerFilters,
  IDelegationListFilters,
  IDelegationRecord,
} from '../interfaces/IDelegationService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { getCurrentSiteUserId, parseSiteUserId } from '../common/currentUserId';
import { idInClause } from '../common/odata';
import {
  IUserRoleListItem,
  USER_ROLES_DIRECTORY_EXPAND,
  USER_ROLES_DIRECTORY_SELECT,
  USER_ROLES_LIST_TITLE,
  toDirectoryPeople,
} from '../common/mapUserRoleRow';
import { applyDelegationSearch } from './delegationSearch';

const DELEGATIONS_LIST_TITLE = 'CORMS_Delegations';
const DELEGATION_ATTACHMENTS_LIST_TITLE = 'CORMS_DelegationAttachments';

/** Same server-side result ceiling every other list-backed Core class in this codebase applies —
 * see CorrespondenceListServiceCore's RESULT_CAP comment. Without it SharePoint's default page size
 * of 100 applies, which for the aggregate reads below (getAuditSummary counts rows client-side)
 * means silently wrong totals rather than a visibly short list. */
const RESULT_CAP = 2000;

/** CORMS_DelegationAttachments.FileType's exact provisioned choice set (listSchemas.ts) —
 * case-sensitive exact match, validated server-side regardless of what the UI already restricts
 * client-side. */
const VALID_ATTACHMENT_FILE_TYPES = ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG'];

/**
 * CORMS_DelegationAttachments is a Document Library (listSchemas.ts's DECISION comment) — SharePoint
 * rejects `items.add()` against a library ("To add an item to a document library, use
 * SPFileCollection.Add()"), so uploading the real file is a separate step from setting its metadata
 * columns. Kept out of this Core class as a narrow injected surface — same
 * IFolderFileSurface-style split AttachmentStorageServiceCore already uses for CORMS_Attachments —
 * so DelegationServiceCore stays Jest-testable without a real PnPjs file API; DelegationService.live.ts
 * is the only place that implements this for real.
 */
export interface IDelegationAttachmentUploadSurface {
  /** Uploads file content into the library and returns the resulting list item's numeric Id, so
   * the caller can set its metadata columns via the ordinary items.getById(id).update() surface. */
  uploadFile(fileName: string, content: Blob | ArrayBuffer): Promise<number>;
}

const DELEGATION_SELECT = [
  'Id',
  'Delegator/Id',
  'Delegator/Title',
  'Delegate/Id',
  'Delegate/Title',
  'Reason',
  'StartDate',
  'EndDate',
  'Status',
  'CreatedBy/Id',
  'CreatedBy/Title',
] as const;
const DELEGATION_EXPAND = ['Delegator', 'Delegate', 'CreatedBy'] as const;

interface IDelegationListItem {
  Id: number;
  Delegator?: { Id: number; Title?: string };
  Delegate?: { Id: number; Title?: string };
  Reason?: string;
  StartDate?: string;
  EndDate?: string;
  Status?: string;
  CreatedBy?: { Id: number; Title?: string };
}

interface IDelegationAttachmentListItem {
  Id: number;
  DelegationId?: string;
  FileName?: string;
  FileType?: string;
  UploadedBy?: { Id: number; Title?: string };
  UploadedAt?: string;
}

function mapDelegationRow(row: IDelegationListItem): IDelegationRecord {
  return {
    id: String(row.Id),
    delegatorId: String(row.Delegator?.Id ?? ''),
    delegatorName: row.Delegator?.Title ?? '',
    delegateId: String(row.Delegate?.Id ?? ''),
    delegateName: row.Delegate?.Title ?? '',
    reason: row.Reason ?? '',
    startDate: row.StartDate ?? '',
    endDate: row.EndDate ?? '',
    status: (row.Status as IDelegationRecord['status']) ?? 'Active',
    createdBy: String(row.CreatedBy?.Id ?? ''),
  };
}

function mapAttachmentRow(row: IDelegationAttachmentListItem): IDelegationAttachmentRecord {
  return {
    id: String(row.Id),
    delegationId: row.DelegationId ?? '',
    fileName: row.FileName ?? '',
    fileType: row.FileType ?? '',
    uploadedBy: String(row.UploadedBy?.Id ?? ''),
    uploadedAt: row.UploadedAt ?? '',
  };
}

/**
 * Pure CORMS_Delegations / CORMS_DelegationAttachments read/write logic (CMS-017) — see
 * provisioningCore.ts's file comment for why Core classes only ever `import type { SPFI }`.
 * DelegationService.live.ts is the thin real wrapper.
 *
 * The audit writer is injected (never constructed here) so this class stays Jest-testable with a
 * hand-rolled IAuditTrailService fake — DelegationService.live.ts is the one place that actually
 * builds a real AuditTrailServiceLive and passes it in.
 *
 * Authorization rules (CMS-017 AC1/AC2):
 *  - Self-service create (isAdmin: false): the caller's own id always wins over whatever
 *    `input.delegator` claims — the server never trusts a client-supplied delegator for its own
 *    identity. This is a silent correction, not a rejection: the create still succeeds, just
 *    always attributed to the real acting user.
 *  - Admin create (isAdmin: true): re-checked server-side against the *caller's own* CORMS_UserRoles
 *    row (never the client's unverified claim of being an admin) — only a confirmed
 *    SystemAdministrator may honor an arbitrary `input.delegator`. Anyone else attempting an admin
 *    create is rejected outright.
 *
 * Status is always written 'Active' on create — see CORMS_DELEGATIONS_SCHEMA's DECISION comment
 * in listSchemas.ts: CMS-017 AC1/AC2 require no approval step for either creation path.
 * Pending/Rejected remain valid Choice values (harmless legacy) but this class never produces
 * them; Revoked is reachable only through revoke().
 */
export class DelegationServiceCore {
  constructor(
    private readonly sp: SPFI,
    private readonly auditTrailService: IAuditTrailService,
    private readonly attachmentUploadSurface: IDelegationAttachmentUploadSurface
  ) {}

  public async create(input: ICreateDelegationInput): Promise<IDelegationRecord> {
    // Validate every attachment before writing anything (delegation row or attachment rows) — one
    // invalid file type aborts the whole call cleanly, with nothing written at all.
    //
    // NOTE: this covers input validation only. An upload that fails *after* the delegation row is
    // written (network, missing library, size) still rejects create() with the delegation row
    // already committed and only some attachments recorded; SharePoint has no transaction to roll
    // that back, and deleting the just-created row on failure would lose the delegation the user
    // asked for. The delegation is the durable part and the attachments are re-attachable, so
    // failing that way round is the deliberate choice.
    input.attachments.forEach((attachment) => {
      if (VALID_ATTACHMENT_FILE_TYPES.indexOf(attachment.fileType) === -1) {
        throw new Error(`Invalid attachment file type "${attachment.fileType}" for file "${attachment.fileName}".`);
      }
    });

    const currentUserId = await getCurrentSiteUserId(this.sp);

    let delegatorId: string;
    if (input.isAdmin) {
      const callerIsAdmin = await this.isSystemAdministrator(currentUserId);
      if (!callerIsAdmin) {
        throw new Error('Only a System Administrator can create a delegation on behalf of another user.');
      }
      // Same parseSiteUserId gate every other caller-supplied id in this class goes through —
      // admin privilege alone doesn't make an unparseable/blank delegator id valid.
      if (parseSiteUserId(input.delegator) === undefined) {
        throw new Error('A valid delegator must be selected for an admin-created delegation.');
      }
      delegatorId = input.delegator;
    } else {
      // AC1 — never trust a client-supplied delegator for a self-service create.
      delegatorId = String(currentUserId);
    }

    if (parseSiteUserId(input.delegate) === undefined) {
      throw new Error('A valid delegate must be selected.');
    }
    // Never allow a delegation naming the same user as both delegator and delegate — re-checked
    // here regardless of what CreateDelegationModal's own picker already excludes, since a caller
    // could construct this class directly and skip that client-side filter (same "server-side is
    // the real gate" rule VALID_ATTACHMENT_FILE_TYPES above enforces).
    if (delegatorId === input.delegate) {
      throw new Error('A delegation cannot be created with the same user as both delegator and delegate.');
    }

    const created = (await this.sp.web.lists.getByTitle(DELEGATIONS_LIST_TITLE).items.add({
      DelegatorId: Number(delegatorId),
      DelegateId: Number(input.delegate),
      Reason: input.reason,
      StartDate: input.startDate,
      EndDate: input.endDate,
      Status: 'Active',
      CreatedById: currentUserId,
    })) as { Id: number };

    const nowIso = new Date().toISOString();
    const attachmentsList = this.sp.web.lists.getByTitle(DELEGATION_ATTACHMENTS_LIST_TITLE);
    // Upload the real file first (creates the library item), then set its metadata columns the
    // normal list-item way — see IDelegationAttachmentUploadSurface's file comment for why this is
    // two steps. Filenames are prefixed with the new delegation's id so two different delegations
    // attaching same-named files (e.g. two "report.pdf") never collide in the library's flat root.
    await Promise.all(
      input.attachments.map(async (attachment) => {
        const itemId = await this.attachmentUploadSurface.uploadFile(`${created.Id}_${attachment.fileName}`, attachment.content);
        await attachmentsList.items.getById(itemId).update({
          DelegationId: String(created.Id),
          FileName: attachment.fileName,
          FileType: attachment.fileType,
          UploadedById: currentUserId,
          UploadedAt: nowIso,
        });
      })
    );

    // Independent of each other — the audit write doesn't need the resolved display names, and
    // resolving names doesn't need the audit write to have landed first — so they run together
    // instead of as two serialized round trips.
    const [, names] = await Promise.all([
      this.auditTrailService
        .logEvent({
          objectId: String(created.Id),
          actor: '',
          action: 'Delegation Created',
          details: JSON.stringify({ delegatorId, delegateId: input.delegate, reason: input.reason }),
          timestamp: nowIso,
        })
        .catch(() => undefined),
      this.resolveUserNames([delegatorId, input.delegate]),
    ]);

    return {
      id: String(created.Id),
      delegatorId,
      delegatorName: names.get(delegatorId) ?? '',
      delegateId: input.delegate,
      delegateName: names.get(input.delegate) ?? '',
      reason: input.reason,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'Active',
      createdBy: String(currentUserId),
    };
  }

  public async revoke(delegationId: string, reason: string): Promise<void> {
    const idNum = Number(delegationId);

    // Independent reads — resolving the acting user doesn't need the row, and fetching the row
    // doesn't need the acting user — issued together instead of serialized.
    const [currentUserId, row] = await Promise.all([
      getCurrentSiteUserId(this.sp),
      this.sp.web.lists
        .getByTitle(DELEGATIONS_LIST_TITLE)
        .items.getById(idNum)
        .select('Id', 'DelegatorId', 'CreatedById')() as Promise<{ Id: number; DelegatorId?: number; CreatedById?: number }>,
    ]);

    // The two cheap in-memory checks first — the SystemAdministrator lookup is a REST round trip
    // and is only needed for the uncommon case where the caller is neither party to the row.
    const authorized =
      row.CreatedById === currentUserId ||
      row.DelegatorId === currentUserId ||
      (await this.isSystemAdministrator(currentUserId));
    if (!authorized) {
      throw new Error('Not authorized to revoke this delegation.');
    }

    // AC10 — revoke never deletes the row, it only flips Status so the delegation stays part of
    // the permanent ledger/audit history.
    await this.sp.web.lists.getByTitle(DELEGATIONS_LIST_TITLE).items.getById(idNum).update({ Status: 'Revoked' });

    await this.auditTrailService
      .logEvent({
        objectId: delegationId,
        actor: '',
        action: 'Delegation Revoked',
        details: JSON.stringify({ delegationId, reason }),
        timestamp: new Date().toISOString(),
      })
      .catch(() => undefined);
  }

  public async listMine(filters?: IDelegationListFilters): Promise<IDelegationRecord[]> {
    // Acting identity resolved server-side, never taken from the caller — see IDelegationService.
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const items = (await this.sp.web.lists
      .getByTitle(DELEGATIONS_LIST_TITLE)
      .items.filter(`DelegatorId eq ${currentUserId}`)
      .select(...DELEGATION_SELECT)
      .expand(...DELEGATION_EXPAND)
      .top(RESULT_CAP)()) as IDelegationListItem[];

    return applyDelegationSearch(items.map(mapDelegationRow), filters?.search);
  }

  public async listAll(filters?: IDelegationListFilters): Promise<IDelegationRecord[]> {
    const items = (await this.sp.web.lists
      .getByTitle(DELEGATIONS_LIST_TITLE)
      .items.select(...DELEGATION_SELECT)
      .expand(...DELEGATION_EXPAND)
      .top(RESULT_CAP)()) as IDelegationListItem[];

    return applyDelegationSearch(items.map(mapDelegationRow), filters?.search);
  }

  public async getAuditSummary(): Promise<IDelegationAuditSummaryRow[]> {
    const items = (await this.sp.web.lists
      .getByTitle(DELEGATIONS_LIST_TITLE)
      .items.select('Id', 'CreatedBy/Id', 'CreatedBy/Title', 'Status')
      .expand('CreatedBy')
      .top(RESULT_CAP)()) as IDelegationListItem[];

    const groups = new Map<string, Omit<IDelegationAuditSummaryRow, 'team'>>();
    items.forEach((row) => {
      const userId = String(row.CreatedBy?.Id ?? '');
      if (!userId) return;
      const existing = groups.get(userId) ?? {
        userId,
        userName: row.CreatedBy?.Title ?? '',
        totalCreated: 0,
        accepted: 0,
        rejected: 0,
        revoked: 0,
      };
      existing.totalCreated += 1;
      // NOTE: "Accepted" is displayed as count of delegations that reached Active status;
      // "Rejected" will trend toward 0 given the no-approval decision — this is expected.
      if (row.Status === 'Active') existing.accepted += 1;
      if (row.Status === 'Rejected') existing.rejected += 1;
      if (row.Status === 'Revoked') existing.revoked += 1;
      groups.set(userId, existing);
    });

    const rows = Array.from(groups.values());
    // One CORMS_UserRoles read for every creator at once, not one per creator — this grid loads on
    // every Delegation screen mount.
    const departments = await this.resolveDepartments(rows.map((r) => r.userId));
    return rows.map((r) => ({ ...r, team: departments.get(r.userId) ?? '' }));
  }

  public async getDelegationLedger(userId: string, filters?: IDelegationLedgerFilters): Promise<IDelegationLedgerEntry[]> {
    const idNum = parseSiteUserId(userId);
    if (idNum === undefined) return [];

    // Not wired into any UI yet (see DelegationView.tsx's TODO), but the caller-supplied `userId`
    // is still never trusted on its own — same authorization shape revoke() already uses: reading
    // your own ledger is always allowed, reading someone else's requires being a confirmed
    // SystemAdministrator, re-checked here rather than assumed from whatever a future caller sends.
    const currentUserId = await getCurrentSiteUserId(this.sp);
    if (String(currentUserId) !== userId && !(await this.isSystemAdministrator(currentUserId))) {
      throw new Error('Not authorized to view this delegation ledger.');
    }

    const items = (await this.sp.web.lists
      .getByTitle(DELEGATIONS_LIST_TITLE)
      .items.filter(`CreatedById eq ${idNum}`)
      .select(...DELEGATION_SELECT)
      .expand(...DELEGATION_EXPAND)
      .top(RESULT_CAP)()) as IDelegationListItem[];

    let records = applyDelegationSearch(items.map(mapDelegationRow), filters?.search);

    if (filters?.team) {
      const departments = await this.resolveDepartments([userId]);
      if (departments.get(userId) !== filters.team) records = [];
    }

    const attachmentsByDelegation = await this.getAttachmentsByDelegation(records.map((r) => r.id));
    return records.map((r) => ({ ...r, attachments: attachmentsByDelegation.get(r.id) ?? [] }));
  }

  public async listDirectory(): Promise<IDirectoryPerson[]> {
    const items = (await this.sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.select(...USER_ROLES_DIRECTORY_SELECT)
      .expand(...USER_ROLES_DIRECTORY_EXPAND)
      .top(RESULT_CAP)()) as IUserRoleListItem[];
    return toDirectoryPeople(items);
  }

  public async getMyDirectoryId(): Promise<string> {
    // The same identity create()'s self-service path attributes a delegation to — exposed so the
    // UI can reliably exclude "myself" from a delegate picker by id instead of comparing display
    // names across site collections (currentUserName in CreateDelegationModal comes from the
    // RecordsHub-site IUser, listDirectory()'s ids come from CORMS_UserRoles on this site — the two
    // are not otherwise comparable).
    return String(await getCurrentSiteUserId(this.sp));
  }

  /** Attachments for every delegation in one query, grouped client-side — a per-delegation query
   * would be one HTTP round trip per ledger row. */
  private async getAttachmentsByDelegation(delegationIds: string[]): Promise<Map<string, IDelegationAttachmentRecord[]>> {
    const byDelegation = new Map<string, IDelegationAttachmentRecord[]>();
    if (delegationIds.length === 0) return byDelegation;

    const items = (await this.sp.web.lists
      .getByTitle(DELEGATION_ATTACHMENTS_LIST_TITLE)
      .items.filter(`(${idInClause('DelegationId', delegationIds)})`)
      .select('Id', 'DelegationId', 'FileName', 'FileType', 'UploadedBy/Id', 'UploadedBy/Title', 'UploadedAt')
      .expand('UploadedBy')
      .top(RESULT_CAP)()) as IDelegationAttachmentListItem[];

    items.map(mapAttachmentRow).forEach((attachment) => {
      const existing = byDelegation.get(attachment.delegationId);
      if (existing) existing.push(attachment);
      else byDelegation.set(attachment.delegationId, [attachment]);
    });
    return byDelegation;
  }

  private async isSystemAdministrator(userId: number): Promise<boolean> {
    const items = await this.sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.filter(`UserId eq ${userId} and Role eq 'SystemAdministrator'`)
      .top(1)
      .select('Id')();
    return (items as Array<{ Id: number }>).length > 0;
  }

  /** CORMS_UserRoles.Department for each of the given user ids, in one query. */
  private resolveDepartments(userIds: string[]): Promise<Map<string, string>> {
    return this.resolveUserRoleField(userIds, ['UserId', 'Department'], [], (row) => row.Department ?? '');
  }

  /** CORMS_UserRoles display names for each of the given user ids, in one query. */
  private resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
    return this.resolveUserRoleField(userIds, ['UserId', 'User/Title'], ['User'], (row) => row.User?.Title ?? '');
  }

  /** Shared shape behind resolveDepartments/resolveUserNames — both are "one CORMS_UserRoles field,
   * batched by user id, in a single query" with only the selected column(s) and how to pluck the
   * value differing, so that part lives in exactly one place instead of two near-identical copies. */
  private async resolveUserRoleField<T>(
    userIds: string[],
    select: readonly string[],
    expand: readonly string[],
    pluck: (row: { UserId?: number; Department?: string; User?: { Title?: string } }) => T
  ): Promise<Map<string, T>> {
    const byUserId = new Map<string, T>();
    const idNums = userIds.map(parseSiteUserId).filter((id): id is number => id !== undefined);
    if (idNums.length === 0) return byUserId;

    const items = (await this.sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.filter(`(${idNums.map((id) => `UserId eq ${id}`).join(' or ')})`)
      .select(...select)
      .expand(...expand)
      .top(RESULT_CAP)()) as Array<{ UserId?: number; Department?: string; User?: { Title?: string } }>;

    items.forEach((row) => {
      if (row.UserId !== undefined) byUserId.set(String(row.UserId), pluck(row));
    });
    return byUserId;
  }
}
