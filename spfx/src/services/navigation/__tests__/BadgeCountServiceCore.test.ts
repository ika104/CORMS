import { BadgeCountServiceCore } from '../BadgeCountServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;

function incomingRow(id: number, overrides: Record<string, unknown> = {}): { Id: number } & Record<string, unknown> {
  return {
    Id: id,
    Title: `Subject ${id}`,
    ReferenceNo: `REF-${id}`,
    Direction: 'Incoming',
    CorrespondenceType: 'Letter',
    Priority: 'Normal',
    SecurityLevel: 'Public/Unclassified',
    DateCreated: '2026-01-01T00:00:00Z',
    Status: 'Registered',
    ...overrides,
  };
}

function makeCore(site: ReturnType<typeof createFakeSite>, clearanceTier = 5): BadgeCountServiceCore {
  return new BadgeCountServiceCore(createFakeSp(site), async () => clearanceTier);
}

describe('CMS-009 AC4 — BadgeCountService triagePendingCount', () => {
  it('counts unseen (unread) items still pending triage', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      incomingRow(1, { Status: 'Registered' }),
      incomingRow(2, { Status: 'In Review' }), // list-side literal for the model's 'InReview'
      incomingRow(3, { Status: 'Approved' }), // past triage — not in the pool
    ]);
    // Item 1 has been read; items 2 (and 3, but it's out of the pool) have not.
    seedList(site, 'CORMS_ReadReceipts', [{ Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-02T00:00:00Z' }]);
    const core = makeCore(site);

    const badge = await core.resolveBadge('triagePendingCount');

    expect(badge).toEqual({ count: 1 }); // only item 2 is both pending-triage and unread
  });

  it('returns no badge when every pending item has been seen', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [incomingRow(1, { Status: 'Registered' })]);
    seedList(site, 'CORMS_ReadReceipts', [{ Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-02T00:00:00Z' }]);
    const core = makeCore(site);

    expect(await core.resolveBadge('triagePendingCount')).toBeUndefined();
  });

  it('excludes items above the user clearance from the count (AC3)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      incomingRow(1, { SecurityLevel: 'Public/Unclassified' }),
      incomingRow(2, { SecurityLevel: 'Top Secret' }),
    ]);
    seedList(site, 'CORMS_ReadReceipts', []);
    const core = makeCore(site, 1); // clearance 1 — the Top Secret item is never visible

    expect(await core.resolveBadge('triagePendingCount')).toEqual({ count: 1 });
  });
});
