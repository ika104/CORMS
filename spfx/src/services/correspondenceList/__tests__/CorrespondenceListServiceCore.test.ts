import { CorrespondenceListServiceCore } from '../CorrespondenceListServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;

function baseRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    Title: 'Subject',
    ReferenceNo: 'REF-1',
    Direction: 'Incoming',
    CorrespondenceType: 'Letter',
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
  seedList(site, 'CORMS_ReadReceipts', []);
}

function makeCore(site: ReturnType<typeof createFakeSite>, clearanceTier = 5): CorrespondenceListServiceCore {
  return new CorrespondenceListServiceCore(createFakeSp(site), async () => clearanceTier);
}

describe('CMS-039', () => {
  it('getInbox: base filter is Direction=Incoming AND AssignedTo=currentUser', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ Direction: 'Incoming', AssignedToId: CURRENT_USER_ID }),
      baseRow({ Direction: 'Incoming', AssignedToId: 999 }),
      baseRow({ Direction: 'Outgoing', AssignedToId: CURRENT_USER_ID }),
    ]);
    const core = makeCore(site);

    const rows = await core.getInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe('Incoming');
  });

  it('getSent: base filter is Direction=Outgoing AND Status != Draft', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ Direction: 'Outgoing', Status: 'Delivered' }),
      baseRow({ Direction: 'Outgoing', Status: 'Draft' }),
      baseRow({ Direction: 'Incoming', Status: 'Delivered' }),
    ]);
    const core = makeCore(site);

    const rows = await core.getSent();

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('Delivered');
  });

  it('getDrafts: base filter is Status=Draft AND Sender=currentUser', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ Status: 'Draft', SenderId: CURRENT_USER_ID }),
      baseRow({ Status: 'Draft', SenderId: 999 }),
      baseRow({ Status: 'Registered', SenderId: CURRENT_USER_ID }),
    ]);
    const core = makeCore(site);

    const rows = await core.getDrafts();

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('Draft');
  });

  it('free-text filter matches Subject or ReferenceNo', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ Title: 'Budget approval' }),
      baseRow({ Title: 'Unrelated', ReferenceNo: 'BUDGET-77' }),
      baseRow({ Title: 'Something else', ReferenceNo: 'REF-2' }),
    ]);
    const core = makeCore(site);

    const rows = await core.getInbox({ freeText: 'budget' });

    expect(rows).toHaveLength(2);
  });

  it('date-range filter constrains DateCreated', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ DateCreated: '2025-06-01T00:00:00Z' }),
      baseRow({ DateCreated: '2026-01-15T00:00:00Z' }),
      baseRow({ DateCreated: '2026-06-01T00:00:00Z' }),
    ]);
    const core = makeCore(site);

    const rows = await core.getInbox({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });

    expect(rows).toHaveLength(1);
    expect(rows[0].createdAt).toBe('2026-01-15T00:00:00Z');
  });

  it('status filter maps the model status to the list Choice value ("InReview" -> "In Review")', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [baseRow({ Status: 'In Review' }), baseRow({ Status: 'Registered' })]);
    const core = makeCore(site);

    const rows = await core.getInbox({ status: 'InReview' });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('InReview');
  });

  it('securityLevel filter constrains to the exact Choice value', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [baseRow({ SecurityLevel: 'Restricted' }), baseRow({ SecurityLevel: 'Public/Unclassified' })]);
    const core = makeCore(site);

    const rows = await core.getInbox({ securityLevel: 'Restricted' });

    expect(rows).toHaveLength(1);
  });

  it('department filter matches DestinationDepartments', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [baseRow({ DestinationDepartments: 'Finance' }), baseRow({ DestinationDepartments: 'Legal' })]);
    const core = makeCore(site);

    const rows = await core.getInbox({ department: 'Finance' });

    expect(rows).toHaveLength(1);
  });

  it('AC8: clearance trimming excludes items above the current user\'s resolved clearance tier', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ SecurityLevel: 'Public/Unclassified' }),
      baseRow({ SecurityLevel: 'Top Secret' }),
    ]);
    const core = makeCore(site, 1);

    const rows = await core.getInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].securityTier).toBe(1);
  });

  it('quick filter "highPriority" constrains to Priority=High', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [baseRow({ Priority: 'High' }), baseRow({ Priority: 'Normal' })]);
    const core = makeCore(site);

    const rows = await core.getInbox({ quickFilter: 'highPriority' });

    expect(rows).toHaveLength(1);
    expect(rows[0].priority).toBe('High');
  });

  it('quick filter "unread" joins CORMS_ReadReceipts and excludes already-read items', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [baseRow({}), baseRow({})]);
    seedList(site, 'CORMS_ReadReceipts', [{ Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' }]);
    const core = makeCore(site);

    const rows = await core.getInbox({ quickFilter: 'unread' });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('2');
  });

  // CMS-009 — the triage queue.
  it('getTriagePending: Direction=Incoming AND Status in (Registered, InReview), any assignee', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ Direction: 'Incoming', Status: 'Registered', AssignedToId: 999 }), // someone else's — still in the shared queue
      baseRow({ Direction: 'Incoming', Status: 'In Review', AssignedToId: CURRENT_USER_ID }), // list-side literal

      baseRow({ Direction: 'Incoming', Status: 'Approved', AssignedToId: CURRENT_USER_ID }), // past triage
      baseRow({ Direction: 'Outgoing', Status: 'Registered', AssignedToId: CURRENT_USER_ID }), // not incoming
    ]);
    const core = makeCore(site);

    const rows = await core.getTriagePending();

    expect(rows.map((r) => r.status).sort()).toEqual(['InReview', 'Registered']);
  });

  it('getTriagePending: trims items above the current user clearance (AC3)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site, [
      baseRow({ SecurityLevel: 'Public/Unclassified', Status: 'Registered' }),
      baseRow({ SecurityLevel: 'Top Secret', Status: 'Registered' }),
    ]);
    const core = makeCore(site, 1); // clearance tier 1 — only the public item

    const rows = await core.getTriagePending();

    expect(rows).toHaveLength(1);
    expect(rows[0].securityTier).toBe(1);
  });
});
