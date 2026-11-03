import type { SPFI } from '@pnp/sp';
import { parseSiteUserId } from '../common/currentUserId';
import { odataDateTimeLiteral } from '../common/odata';

const DELEGATIONS_LIST_TITLE = 'CORMS_Delegations';

interface IActiveDelegationListItem {
  Id: number;
  DelegatorId?: number;
}

/**
 * Delegation & Reassignment Backend task (CMS-017 AC8) — resolves whether the acting user is
 * currently standing in for someone else via an Active, date-in-range CORMS_Delegations row, so a
 * caller performing an audited action can record "on behalf of" context. Deliberately separate
 * from IDelegationService: this is a narrow read-only lookup other Core classes depend on (see
 * CorrespondenceDetailServiceCore.logView), not part of the Delegation Management screen's own
 * CRUD surface.
 *
 * See provisioningCore.ts's file comment for why Core-layer classes only ever `import type { SPFI }`.
 */
export class DelegationContextResolver {
  constructor(private readonly sp: SPFI) {}

  public async getActiveDelegationFor(actingUserId: string): Promise<{ delegatorId: string } | undefined> {
    const idNum = parseSiteUserId(actingUserId);
    if (idNum === undefined) return undefined;

    // "Today falls within StartDate..EndDate" has to be checked against the whole of today, not the
    // current instant: CreateDelegationModal collects date-only values (<input type="date">) and
    // CORMS_Delegations stores them as DateTime, so a delegation ending today is stored as that
    // day's midnight — comparing it against `now` would silently expire it partway through its own
    // final day. Bounding the range by start-of-day/end-of-day instead makes both endpoints
    // inclusive. (odataDateTimeLiteral also strips the milliseconds SharePoint rejects with a 400.)
    const todayDate = new Date().toISOString().slice(0, 10);
    const startOfToday = odataDateTimeLiteral(`${todayDate}T00:00:00Z`);
    const endOfToday = odataDateTimeLiteral(`${todayDate}T23:59:59Z`);
    const items = (await this.sp.web.lists
      .getByTitle(DELEGATIONS_LIST_TITLE)
      .items.filter(
        `DelegateId eq ${idNum} and Status eq 'Active' and StartDate le ${endOfToday} and EndDate ge ${startOfToday}`
      )
      .select('Id', 'DelegatorId')
      .top(1)()) as IActiveDelegationListItem[];

    const row = items[0];
    if (!row || row.DelegatorId === undefined) return undefined;
    return { delegatorId: String(row.DelegatorId) };
  }
}
