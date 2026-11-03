import { CorrespondenceDashboardServiceCore } from '../CorrespondenceDashboardServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;

function baseRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    Title: 'Subject',
    ReferenceNo: 'REF-1',
    Direction: 'Incoming',
    CorrespondenceType: 'Incoming',
    Priority: 'Normal',
    SecurityLevel: 'Public/Unclassified',
    DestinationDepartments: 'Finance',
    Sender: { Title: 'Alice' },
    Recipient: 'Bob',
    AssignedTo: { Title: 'Charlie' },
    AssignedToId: CURRENT_USER_ID,
    SenderId: CURRENT_USER_ID,
    DateCreated: '2026-01-01T00:00:00Z',
    Status: 'Registered',
    ...overrides,
  };
}

function seedCorrespondence(site: ReturnType<typeof createFakeSite>, rows: Array<Record<string, unknown>>): void {
  seedList(site, 'CORMS_Correspondence', rows.map((r, i) => ({ Id: i + 1, ...r })));
}

function makeCore(site: ReturnType<typeof createFakeSite>, clearanceTier = 5): CorrespondenceDashboardServiceCore {
  return new CorrespondenceDashboardServiceCore(createFakeSp(site), async () => clearanceTier);
}

describe('Part 4 — CorrespondenceDashboardServiceCore', () => {
  it('getAll returns every row within clearance, regardless of Direction/Status', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ Direction: 'Incoming', Status: 'Draft' }),
      baseRow({ Direction: 'Outgoing', Status: 'Delivered' }),
      baseRow({ Direction: 'Incoming', Status: 'Registered' }),
    ]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows).toHaveLength(3);
  });

  it('clearance trimming excludes items above the current user\'s resolved clearance tier', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ SecurityLevel: 'Public/Unclassified' }),
      baseRow({ SecurityLevel: 'Top Secret' }),
    ]);
    const core = makeCore(site, 1);

    const rows = await core.getAll();

    expect(rows).toHaveLength(1);
    expect(rows[0].securityTier).toBe(1);
  });

  it('free-text filter still applies on top of the unrestricted base set', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [baseRow({ Title: 'Budget approval' }), baseRow({ Title: 'Something else' })]);
    const core = makeCore(site);

    const rows = await core.getAll({ freeText: 'budget' });

    expect(rows).toHaveLength(1);
  });
});
