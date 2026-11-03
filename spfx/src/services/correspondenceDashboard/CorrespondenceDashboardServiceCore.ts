import type { SPFI } from '@pnp/sp';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { buildCorrespondenceFilter } from '../common/buildCorrespondenceFilter';
import {
  CORRESPONDENCE_LIST_EXPAND,
  CORRESPONDENCE_LIST_SELECT,
  ICorrespondenceListItem,
  mapCorrespondenceRowToStub,
} from '../common/mapCorrespondenceRow';
const LIST_TITLE = 'CORMS_Correspondence';

// Same server-side-filter-capped, client-side-paginated approach as CorrespondenceListServiceCore
// (see that file's RESULT_CAP comment) — one convention, not a second one for this screen.
const RESULT_CAP = 2000;

/**
 * Pure CORMS_Correspondence query logic for My Correspondence (Create Correspondence backend
 * task, Part 4) — extends the CorrespondenceListServiceCore pattern (same clearance helper, same
 * mapper, same result cap) rather than duplicating it. See provisioningCore.ts's file comment for
 * why Core classes only `import type { SPFI }`. CorrespondenceDashboardService.live.ts is the
 * thin real wrapper.
 */
export class CorrespondenceDashboardServiceCore {
  constructor(
    private readonly sp: SPFI,
    private readonly getCurrentUserClearanceTier: () => Promise<number>
  ) {}

  public async getAll(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    const clearanceTier = await this.getCurrentUserClearanceTier();
    // "All within clearance" has no fixed base condition of its own (unlike Inbox/Sent/Drafts) —
    // `Status ne ''` is always true for any real row (Status is never blank) and keeps this a
    // single, consistent $filter-builder call through buildCorrespondenceFilter rather than a
    // special no-base-clause code path.
    const filterClause = buildCorrespondenceFilter(`Status ne ''`, filters, clearanceTier);

    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(filterClause)
      .select(...CORRESPONDENCE_LIST_SELECT)
      .expand(...CORRESPONDENCE_LIST_EXPAND)
      .orderBy('DateCreated', false)
      .top(RESULT_CAP)()) as ICorrespondenceListItem[];

    return items.map(mapCorrespondenceRowToStub);
  }
}
