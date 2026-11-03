import { SubordinateInboxServiceCore } from '../SubordinateInboxServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';
import { IOrgHierarchyService } from '../../interfaces/IOrgHierarchyService';
import { IDirectoryPerson } from '../../../models/IDelegation';

const SUPERVISOR_ID = '100';
const REPORT_A = '10';
const REPORT_B = '20';
const NOT_A_REPORT = '999';

function directoryPerson(id: string, overrides: Partial<IDirectoryPerson> = {}): IDirectoryPerson {
  return { id, displayName: `User ${id}`, team: 'Ops', clearanceTier: 5, ...overrides };
}

/** getTeamInbox() goes through getMyDirectReports() (which resolves the acting supervisor itself,
 * server-side) rather than calling getDirectReports(managerId) with a caller-derived id — that
 * real resolve-self-then-get-direct-reports behavior is exactly what OrgHierarchyServiceCore's own
 * tests cover, so this fake just returns `reports` unconditionally for getMyDirectReports().
 * getDirectReports is still provided (SUPERVISOR_ID-gated) for any test that wants to exercise it
 * directly, but SubordinateInboxServiceCore no longer calls it. */
function fakeOrgHierarchy(reports: IDirectoryPerson[]): IOrgHierarchyService & { getDirectReports: jest.Mock } {
  const getDirectReports = jest.fn((managerId: string) => Promise.resolve(managerId === SUPERVISOR_ID ? reports : []));
  return { getDirectReports, getMyDirectReports: jest.fn(() => Promise.resolve(reports)) };
}

function baseRow(ownerId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    AssignedTo: { Id: Number(ownerId), Title: `User ${ownerId}` },
    AssignedToId: Number(ownerId),
    DateCreated: '2026-01-01T00:00:00Z',
    Status: 'Registered',
    ...overrides,
  };
}

function seedCorrespondence(site: ReturnType<typeof createFakeSite>, rows: Array<Record<string, unknown>>): void {
  seedList(site, 'CORMS_Correspondence', rows.map((r, i) => ({ Id: i + 1, ...r })));
}

function makeCore(
  site: ReturnType<typeof createFakeSite>,
  orgHierarchyService: IOrgHierarchyService,
  clearanceTier = 5
): SubordinateInboxServiceCore {
  return new SubordinateInboxServiceCore(createFakeSp(site), async () => clearanceTier, orgHierarchyService);
}

describe('CMS-018 SubordinateInboxServiceCore', () => {
  it('AC1: combines items across every direct report into one result', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    seedCorrespondence(site, [
      baseRow(REPORT_A),
      baseRow(REPORT_B),
      baseRow(NOT_A_REPORT), // not one of the supervisor's direct reports — excluded
    ]);
    seedList(site, 'CORMS_ReadReceipts', []);
    const org = fakeOrgHierarchy([directoryPerson(REPORT_A), directoryPerson(REPORT_B)]);
    const core = makeCore(site, org);

    const rows = await core.getTeamInbox();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ownerId).sort()).toEqual([REPORT_A, REPORT_B].sort());
    // getTeamInbox() goes through getMyDirectReports() (which itself resolves-self-then-gets-direct-reports)
    // rather than re-deriving the supervisor id and calling getDirectReports() directly — see
    // SubordinateInboxServiceCore's own comment on why.
    expect(org.getMyDirectReports).toHaveBeenCalled();
  });

  it('AC1: a supervisor with zero direct reports gets an empty result (no correspondence query)', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    seedCorrespondence(site, [baseRow(REPORT_A)]);
    seedList(site, 'CORMS_ReadReceipts', []);
    const org = fakeOrgHierarchy([]);
    const core = makeCore(site, org);

    const rows = await core.getTeamInbox();

    expect(rows).toEqual([]);
  });

  it('AC2: an item above the supervisor\'s own clearance tier is excluded from the result set entirely', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    seedCorrespondence(site, [
      baseRow(REPORT_A, { SecurityLevel: 'Public/Unclassified' }),
      baseRow(REPORT_A, { SecurityLevel: 'Top Secret' }),
    ]);
    seedList(site, 'CORMS_ReadReceipts', []);
    const org = fakeOrgHierarchy([directoryPerson(REPORT_A)]);
    const core = makeCore(site, org, 1);

    const rows = await core.getTeamInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].securityTier).toBe(1);
  });

  it('AC3: an item with no matching CORMS_ReadReceipts row for its owner computes displayStatus "New"', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    seedCorrespondence(site, [baseRow(REPORT_A, { Status: 'Registered' })]);
    // Read receipt exists but for a different user — must not count as "read by the owner".
    seedList(site, 'CORMS_ReadReceipts', [
      { Id: 1, CorrespondenceId: '1', UserId: Number(REPORT_B), ReadAt: '2026-01-01T00:00:00Z' },
    ]);
    const org = fakeOrgHierarchy([directoryPerson(REPORT_A)]);
    const core = makeCore(site, org);

    const rows = await core.getTeamInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].displayStatus).toBe('New');
  });

  it.each(['In Review', 'Approved'])(
    'AC3: an item with Status "%s" computes displayStatus "InProgress"',
    async (rawStatus) => {
      const site = createFakeSite(Number(SUPERVISOR_ID));
      seedCorrespondence(site, [baseRow(REPORT_A, { Status: rawStatus })]);
      seedList(site, 'CORMS_ReadReceipts', [
        { Id: 1, CorrespondenceId: '1', UserId: Number(REPORT_A), ReadAt: '2026-01-01T00:00:00Z' },
      ]);
      const org = fakeOrgHierarchy([directoryPerson(REPORT_A)]);
      const core = makeCore(site, org);

      const rows = await core.getTeamInbox();

      expect(rows).toHaveLength(1);
      expect(rows[0].displayStatus).toBe('InProgress');
    }
  );

  it('AC3: displayStatus is never "PendingResponse" today — stubbed false, falls back to InProgress/New', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    // A fixture that would plausibly be "pending response"-shaped in a real system: high-priority,
    // already Registered (out for a reply), read by the owner (so it isn't merely "New" either).
    seedCorrespondence(site, [baseRow(REPORT_A, { Status: 'Registered', Priority: 'High' })]);
    seedList(site, 'CORMS_ReadReceipts', [
      { Id: 1, CorrespondenceId: '1', UserId: Number(REPORT_A), ReadAt: '2026-01-01T00:00:00Z' },
    ]);
    const org = fakeOrgHierarchy([directoryPerson(REPORT_A)]);
    const core = makeCore(site, org);

    const rows = await core.getTeamInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].displayStatus).not.toBe('PendingResponse');
    expect(rows[0].displayStatus).toBe('InProgress');
  });

  it('AC3: precedence — an item that is both unread AND Status="Approved" computes "InProgress", not "New"', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    seedCorrespondence(site, [baseRow(REPORT_A, { Status: 'Approved' })]);
    seedList(site, 'CORMS_ReadReceipts', []); // no read receipt at all -> would be "New" if InProgress didn't win
    const org = fakeOrgHierarchy([directoryPerson(REPORT_A)]);
    const core = makeCore(site, org);

    const rows = await core.getTeamInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].displayStatus).toBe('InProgress');
  });

  it('ownerId reflects the assigned subordinate, not the supervisor', async () => {
    const site = createFakeSite(Number(SUPERVISOR_ID));
    seedCorrespondence(site, [baseRow(REPORT_A)]);
    seedList(site, 'CORMS_ReadReceipts', []);
    const org = fakeOrgHierarchy([directoryPerson(REPORT_A)]);
    const core = makeCore(site, org);

    const rows = await core.getTeamInbox();

    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toBe(REPORT_A);
    expect(rows[0].ownerId).not.toBe(SUPERVISOR_ID);
  });
});
