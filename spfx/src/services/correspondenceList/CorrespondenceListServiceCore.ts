import type { SPFI } from '@pnp/sp';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { buildCorrespondenceFilter } from '../common/buildCorrespondenceFilter';
import {
  CORRESPONDENCE_LIST_EXPAND,
  CORRESPONDENCE_LIST_SELECT,
  ICorrespondenceListItem,
  mapCorrespondenceRowToStub,
  mapStatusToListValue,
} from '../common/mapCorrespondenceRow';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { ReadReceiptServiceCore } from '../readReceipts/ReadReceiptServiceCore';

const LIST_TITLE = 'CORMS_Correspondence';

// SharePoint REST list paging is $skiptoken-based, not offset-based — true arbitrary-page random
// access isn't cheap. Chosen approach (Part 4, option a): server-side filter/sort, capped at
// RESULT_CAP rows in one REST call, then paginate client-side via the existing Pagination
// component. TODO(confirm): revisit server-side skiptoken paging (option b) once real list
// volumes are known — this cap is a placeholder, not a measured limit.
const RESULT_CAP = 2000;

/**
 * Pure CORMS_Correspondence query logic for Inbox/Sent/Drafts (CMS-039) — see
 * provisioningCore.ts's file comment for why Core classes only `import type { SPFI }`.
 * CorrespondenceListService.live.ts is the thin real wrapper.
 */
export class CorrespondenceListServiceCore {
  constructor(
    private readonly sp: SPFI,
    /** Resolves the current user's clearance tier — sourced from the existing, unmodified
     * ds.securityTiers-backed IUser.clearanceTier (see clearance.ts's file comment), injected as
     * a plain function so this Core class stays free of any dependency on IRecordsHubService. */
    private readonly getCurrentUserClearanceTier: () => Promise<number>
  ) {}

  public getInbox(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.query((currentUserId) => `Direction eq 'Incoming' and AssignedToId eq ${currentUserId}`, filters);
  }

  // TODO(confirm): the task's own spec for getSent is literally "Direction eq 'Outgoing' AND
  // Status ne 'Draft'" — no current-user scoping, unlike getInbox (AssignedTo) and getDrafts
  // (Author). Implemented exactly as specified rather than silently adding a SenderId filter;
  // revisit if "Sent" is meant to be scoped to items the current user personally sent.
  public getSent(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.query(() => `Direction eq 'Outgoing' and Status ne 'Draft'`, filters);
  }

  public getDrafts(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.query((currentUserId) => `Status eq 'Draft' and SenderId eq ${currentUserId}`, filters);
  }

  /**
   * CMS-009 — the triage queue: every incoming item still pending triage (Registered or InReview),
   * clearance-trimmed like every other list read (AC3). Deliberately *not* scoped to AssignedTo —
   * triage is a shared receiving-role queue, not one officer's personal inbox — so any authorised
   * receiving role sees the same pending pool. Backs the Triage nav badge via BadgeCountService.
   */
  public getTriagePending(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    // Status is stored list-side as 'In Review' (with a space), not the model's 'InReview' —
    // mapStatusToListValue is the single source of truth for that reconciliation.
    const registered = mapStatusToListValue('Registered');
    const inReview = mapStatusToListValue('InReview');
    return this.query(
      () => `Direction eq 'Incoming' and (Status eq '${registered}' or Status eq '${inReview}')`,
      filters
    );
  }

  private async query(
    buildBaseClause: (currentUserId: number) => string,
    filters?: ICorrespondenceListFilters
  ): Promise<ICorrespondenceStub[]> {
    const [currentUserId, clearanceTier] = await Promise.all([
      getCurrentSiteUserId(this.sp),
      this.getCurrentUserClearanceTier(),
    ]);
    const filterClause = buildCorrespondenceFilter(buildBaseClause(currentUserId), filters, clearanceTier);

    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(filterClause)
      .select(...CORRESPONDENCE_LIST_SELECT)
      .expand(...CORRESPONDENCE_LIST_EXPAND)
      .orderBy('DateCreated', false)
      .top(RESULT_CAP)()) as ICorrespondenceListItem[];

    let stubs = items.map(mapCorrespondenceRowToStub);

    // Unread quick filter — joins against CORMS_ReadReceipts, a separate list, so it can't be
    // folded into the single $filter above; applied client-side over the already server-filtered
    // set instead (still real, per-user data, just a second round trip).
    if (filters?.quickFilter === 'unread') {
      const readReceipts = new ReadReceiptServiceCore(this.sp);
      const unreadIds = await readReceipts.getUnreadIds(stubs.map((s) => s.id));
      stubs = stubs.filter((s) => unreadIds.has(s.id));
    }

    return stubs;
  }
}
