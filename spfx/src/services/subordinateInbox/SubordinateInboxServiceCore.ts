import type { SPFI } from '@pnp/sp';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { ITeamInboxQueryItem, TeamInboxStatus } from '../../models/ITeamInbox';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { buildCorrespondenceFilter } from '../common/buildCorrespondenceFilter';
import {
  CORRESPONDENCE_LIST_EXPAND,
  CORRESPONDENCE_LIST_SELECT,
  ICorrespondenceListItem,
  mapCorrespondenceRowToStub,
} from '../common/mapCorrespondenceRow';
import { idInClause } from '../common/odata';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';
const READ_RECEIPTS_LIST_TITLE = 'CORMS_ReadReceipts';

/** Same server-side result ceiling every other list-backed Core class in this codebase applies —
 * see CorrespondenceListServiceCore's RESULT_CAP comment. Without it SharePoint's default page size
 * of 100 silently truncates the result, and DataGrid (which paginates client-side over whatever it
 * is handed) shows no sign that rows are missing. */
const RESULT_CAP = 2000;

/** The shared ICorrespondenceListItem (mapCorrespondenceRow.ts) only types AssignedTo as
 * {Title?: string} since no other existing caller needs the numeric id — extended locally here
 * (Team Inbox needs it, to know which subordinate owns each row) rather than widening the shared
 * interface for every other consumer. */
interface ISubordinateListItem extends ICorrespondenceListItem {
  Id: number;
  AssignedTo?: { Id?: number; Title?: string };
}

type IOwnedCorrespondenceStub = ICorrespondenceStub & { ownerId: string };

/**
 * Pure CORMS_Correspondence + CORMS_ReadReceipts query logic backing the Team Inbox (CMS-018) —
 * see provisioningCore.ts's file comment for why Core classes only `import type { SPFI }`.
 * SubordinateInboxService.live.ts is the thin real wrapper.
 */
export class SubordinateInboxServiceCore {
  constructor(
    private readonly sp: SPFI,
    /** Resolves the *supervisor's own* clearance tier (not any subordinate's) — the viewing
     * supervisor's clearance is what gates their Team Inbox, mirroring
     * CorrespondenceListServiceCore's own-inbox clearance trimming via buildCorrespondenceFilter,
     * which excludes over-tier items from the result set entirely rather than merely flagging
     * them. */
    private readonly getSupervisorClearanceTier: () => Promise<number>,
    private readonly orgHierarchyService: IOrgHierarchyService
  ) {}

  public async getTeamInbox(filters?: ICorrespondenceListFilters): Promise<ITeamInboxQueryItem[]> {
    // The viewing supervisor is resolved server-side against CORMS's own site, never taken from the
    // caller — see ISubordinateInboxService.getTeamInbox. orgHierarchyService.getMyDirectReports()
    // already does exactly that resolve-self-then-get-direct-reports sequence (see
    // IOrgHierarchyService), so it's reused here rather than re-inlined; TeamInboxView's own
    // getMyDirectReports() call (for its "Viewing" dropdown) and this one dedupe into a single
    // request when they land on the same shared OrgHierarchyServiceLive instance (see that class's
    // in-flight-request comment). The clearance lookup is independent of the reporting-line lookup
    // and goes cross-site to RecordsHub, so both are started together rather than serialized.
    const [reports, clearanceTier] = await Promise.all([this.orgHierarchyService.getMyDirectReports(), this.getSupervisorClearanceTier()]);
    if (reports.length === 0) return [];

    // No `in` operator convention in this codebase — OR-of-eq across every direct report's id,
    // the same shape common/odata.ts's idInClause builds, applied to the numeric
    // CORMS_Correspondence.AssignedTo field (no quoting/escaping, hence not that helper).
    const baseClause = `(${reports.map((r) => `AssignedToId eq ${Number(r.id)}`).join(' or ')})`;
    // buildCorrespondenceFilter always ANDs its own clearance clause (and, when present, other
    // clauses) after baseClause — since baseClause itself is a parenthesized OR-group, the
    // resulting string is "(A or B) and (C or D) and ...". A redundant outer wrap keeps this
    // unambiguous under standard AND-before-OR precedence (baseClause must bind as one group, not
    // "A or (B and C...)"). Harmless no-op for a real SharePoint REST $filter.
    const filterClause = `(${buildCorrespondenceFilter(baseClause, filters, clearanceTier)})`;

    const rows = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.filter(filterClause)
      .select(...CORRESPONDENCE_LIST_SELECT, 'AssignedTo/Id')
      .expand(...CORRESPONDENCE_LIST_EXPAND)
      .orderBy('DateCreated', false)
      .top(RESULT_CAP)()) as ISubordinateListItem[];

    const items: IOwnedCorrespondenceStub[] = rows.map((row) => ({
      ...mapCorrespondenceRowToStub(row),
      ownerId: String(row.AssignedTo?.Id ?? ''),
    }));

    const unreadIds = await this.getUnreadIdsByOwner(items);

    return items.map((item) => ({
      ...item,
      displayStatus: this.computeDisplayStatus(item, unreadIds),
    }));
  }

  /**
   * "New" (AC3) means the *assigned subordinate* hasn't opened the item, not that the viewing
   * supervisor hasn't — so this can't reuse ReadReceiptServiceCore's methods, which are hard-keyed
   * to the current signed-in user via getCurrentSiteUserId. Instead: group the already-fetched
   * items by owner, then issue exactly one CORMS_ReadReceipts query per unique owner (not one per
   * item), mirroring ReadReceiptServiceCore's exact
   * `UserId eq X and (CorrespondenceId eq 'a' or ...)` query shape, just keyed per-owner.
   */
  private async getUnreadIdsByOwner(items: IOwnedCorrespondenceStub[]): Promise<Set<string>> {
    const idsByOwner = new Map<string, string[]>();
    items.forEach((item) => {
      if (!item.ownerId) return;
      const existing = idsByOwner.get(item.ownerId);
      if (existing) existing.push(item.id);
      else idsByOwner.set(item.ownerId, [item.id]);
    });

    const unread = new Set<string>();
    await Promise.all(
      Array.from(idsByOwner.entries()).map(async ([ownerId, correspondenceIds]) => {
        const readRows = (await this.sp.web.lists
          .getByTitle(READ_RECEIPTS_LIST_TITLE)
          .items.filter(`UserId eq ${Number(ownerId)} and (${idInClause('CorrespondenceId', correspondenceIds)})`)
          // Unread is computed as *absence* from this result, so a truncated page would render
          // already-read items as "New" — the cap has to comfortably exceed the page above's.
          .select('CorrespondenceId')
          .top(RESULT_CAP)()) as Array<{ CorrespondenceId: string }>;
        const readIds = new Set(readRows.map((r) => r.CorrespondenceId));
        correspondenceIds.forEach((id) => {
          if (!readIds.has(id)) unread.add(id);
        });
      })
    );
    return unread;
  }

  /**
   * Three-way display status mapping (also documented on ITeamInboxQueryItem.displayStatus):
   *  1. PendingResponse — TODO: wire real pendingResponse status once CMS-014's backend lands;
   *     stubbed always-false today (no such field/flag exists anywhere in this codebase yet), so
   *     this branch never fires.
   *  2. InProgress — raw Status maps to model 'InReview' or 'Approved'.
   *  3. New — no CORMS_ReadReceipts row exists for (item, owner) — the assigned subordinate
   *     hasn't opened it.
   *  4. Default — InProgress, for anything else (e.g. a Registered-but-read item).
   * Precedence is checked in exactly that order: InProgress wins over New when both would
   * otherwise apply (e.g. an unread item that's already Approved is InProgress, not New).
   */
  private computeDisplayStatus(item: IOwnedCorrespondenceStub, unreadIds: Set<string>): TeamInboxStatus {
    const isInProgress = item.status === 'InReview' || item.status === 'Approved';
    const isUnread = unreadIds.has(item.id);
    return isInProgress ? 'InProgress' : isUnread ? 'New' : 'InProgress';
  }
}
