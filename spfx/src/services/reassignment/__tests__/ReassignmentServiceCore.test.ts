import { ReassignmentServiceCore } from '../ReassignmentServiceCore';
import { OrgHierarchyServiceCore } from '../../orgHierarchy/OrgHierarchyServiceCore';
import { IOrgHierarchyService } from '../../interfaces/IOrgHierarchyService';
import { IAuditTrailService } from '../../interfaces/IAuditTrailService';
import { IGlobalAuditEntry } from '../../../models/IAuditTrail';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CORRESPONDENCE_ID = '100';
const FROM_USER_ID = '10';
const TO_USER_ID = '11';
const SUPERVISOR_ID = '99';

/** `clearanceByUserId` mirrors what OrgHierarchyService really returns per direct report — the
 * reassignment clearance gate reads IDirectoryPerson.clearanceTier from this same result rather
 * than re-querying CORMS_UserRoles (both read the identical ClearanceTier column). Reports are
 * returned only for the supervisor they belong to, so a call naming a different supervisor gets
 * nothing back, exactly as the live query would. */
function makeFakeOrgHierarchyService(
  directReportIds: string[],
  clearanceByUserId: Record<string, number> = {}
): IOrgHierarchyService & { getDirectReports: jest.Mock } {
  const reportsFor = (managerId: string): unknown[] =>
    managerId === SUPERVISOR_ID
      ? directReportIds.map((id) => ({
          id,
          displayName: `Person ${id}`,
          team: 'Ops',
          clearanceTier: clearanceByUserId[id] ?? 1,
          isSupervisor: false,
        }))
      : [];
  const getDirectReports = jest.fn((managerId: string) => Promise.resolve(reportsFor(managerId)));
  return {
    getDirectReports,
    getMyDirectReports: jest.fn(() => Promise.resolve(reportsFor(SUPERVISOR_ID))),
  } as unknown as IOrgHierarchyService & { getDirectReports: jest.Mock };
}

function makeFakeAuditTrailService(): IAuditTrailService & { logEvent: jest.Mock } {
  const entries: IGlobalAuditEntry[] = [];
  const logEvent = jest.fn().mockImplementation(
    (entry: Omit<IGlobalAuditEntry, 'id' | 'seq' | 'category' | 'chainStatus'>) => {
      const created: IGlobalAuditEntry = {
        id: `audit-${entries.length + 1}`,
        seq: entries.length + 1,
        category: 'correspondence',
        chainStatus: 'valid',
        ...entry,
      };
      entries.push(created);
      return Promise.resolve(created);
    }
  );
  return {
    getEntries: jest.fn().mockImplementation(() => Promise.resolve([...entries])),
    logEvent,
    getReassignmentsInvolving: jest.fn().mockImplementation((userId: string) =>
      Promise.resolve(
        entries.filter((entry) => {
          try {
            return String((JSON.parse(entry.details) as { fromUserId?: unknown }).fromUserId ?? '') === userId;
          } catch {
            return false;
          }
        })
      )
    ),
  };
}

function seedCorrespondence(site: ReturnType<typeof createFakeSite>, securityLevel: string, assignedToId = 5): void {
  seedList(site, 'CORMS_Correspondence', [{ Id: Number(CORRESPONDENCE_ID), SecurityLevel: securityLevel, AssignedToId: assignedToId }]);
}

/** The signed-in user *is* the acting supervisor — ReassignmentServiceCore resolves them via
 * getCurrentSiteUserId rather than taking a supervisorId from the input. */
function makeSite(): ReturnType<typeof createFakeSite> {
  return createFakeSite(Number(SUPERVISOR_ID));
}

describe('ReassignmentServiceCore — CMS-019 Reassign Correspondence backend', () => {
  it('AC1/AC2: rejects reassignment when toUserId clearance tier is below the item SecurityLevel tier, even when called directly bypassing any UI filtering, and leaves AssignedTo unchanged', async () => {
    const site = makeSite();
    seedCorrespondence(site, 'Secret'); // tier 4
    const sp = createFakeSp(site);
    const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID], { [TO_USER_ID]: 1 }); // far below tier 4
    const audit = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, org, audit);

    await expect(
      core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' })
    ).rejects.toThrow();

    expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(5);
    expect(audit.logEvent).not.toHaveBeenCalled();
  });

  it('reassigns and updates AssignedToId when the toUser clearance is sufficient for the item', async () => {
    const site = makeSite();
    seedCorrespondence(site, 'Secret'); // tier 4
    const sp = createFakeSp(site);
    const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID], { [TO_USER_ID]: 4 }); // exactly sufficient
    const audit = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, org, audit);

    await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' });

    expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(Number(TO_USER_ID));
  });

  describe('both-direct-reports validation', () => {
    it('rejects when fromUserId is not one of supervisorId direct reports', async () => {
      const site = makeSite();
      seedCorrespondence(site, 'Public/Unclassified');
      const sp = createFakeSp(site);
      const org = makeFakeOrgHierarchyService([TO_USER_ID]); // fromUserId missing
      const audit = makeFakeAuditTrailService();
      const core = new ReassignmentServiceCore(sp, org, audit);

      await expect(
        core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' })
      ).rejects.toThrow();
      expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(5);
    });

    it('rejects when toUserId is not one of supervisorId direct reports', async () => {
      const site = makeSite();
      seedCorrespondence(site, 'Public/Unclassified');
      const sp = createFakeSp(site);
      const org = makeFakeOrgHierarchyService([FROM_USER_ID]); // toUserId missing
      const audit = makeFakeAuditTrailService();
      const core = new ReassignmentServiceCore(sp, org, audit);

      await expect(
        core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' })
      ).rejects.toThrow();
      expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(5);
    });

    it('succeeds when both fromUserId and toUserId are direct reports of supervisorId', async () => {
      const site = makeSite();
      seedCorrespondence(site, 'Public/Unclassified');
      const sp = createFakeSp(site);
      const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID]);
      const audit = makeFakeAuditTrailService();
      const core = new ReassignmentServiceCore(sp, org, audit);

      await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' });

      expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(Number(TO_USER_ID));
    });

    it('resolves the acting supervisor from the signed-in identity, so a caller cannot reassign another supervisor other-team work by naming them', async () => {
      // The signed-in user is NOT the supervisor these two users report to. Nothing in
      // IReassignInput names a supervisor, so there is no way to claim to be one — and the
      // direct-reports lookup is issued for the resolved caller, who has no reports at all.
      const site = createFakeSite(12345);
      seedCorrespondence(site, 'Public/Unclassified');
      const sp = createFakeSp(site);
      const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID]);
      const audit = makeFakeAuditTrailService();
      const core = new ReassignmentServiceCore(sp, org, audit);

      await expect(
        core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' })
      ).rejects.toThrow();

      expect(org.getDirectReports).toHaveBeenCalledWith('12345');
      expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(5);
      expect(audit.logEvent).not.toHaveBeenCalled();
    });
  });

  it('AC1/AC2: the clearance gate reads the live CORMS_UserRoles.ClearanceTier column, through the real OrgHierarchyServiceCore', async () => {
    // Same rejection as the first test, but with no fake in the clearance path at all — proves the
    // tier the gate compares against genuinely comes from the provisioned column, now that
    // ReassignmentServiceCore reuses the direct-reports result instead of re-querying it.
    const site = makeSite();
    seedCorrespondence(site, 'Secret'); // tier 4
    seedList(site, 'CORMS_UserRoles', [
      { Id: 1, User: { Id: Number(FROM_USER_ID) }, ManagerUserId: Number(SUPERVISOR_ID), ClearanceTier: 4 },
      { Id: 2, User: { Id: Number(TO_USER_ID) }, ManagerUserId: Number(SUPERVISOR_ID), ClearanceTier: 2 },
    ]);
    const sp = createFakeSp(site);
    const audit = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, new OrgHierarchyServiceCore(sp) as unknown as IOrgHierarchyService, audit);

    await expect(
      core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' })
    ).rejects.toThrow();
    expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(5);

    // ...and succeeds once that same column says the recipient is cleared for it.
    site.lists.CORMS_UserRoles.items[1].ClearanceTier = 4;
    await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' });
    expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(Number(TO_USER_ID));
  });

  it('AC3: logs a "Correspondence Reassigned" audit entry whose details JSON carries all five fields after a successful reassign', async () => {
    const site = makeSite();
    seedCorrespondence(site, 'Public/Unclassified');
    const sp = createFakeSp(site);
    const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID]);
    const audit = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, org, audit);

    await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage during leave' });

    expect(audit.logEvent).toHaveBeenCalledTimes(1);
    const call = audit.logEvent.mock.calls[0][0] as { objectId: string; action: string; details: string; timestamp: string };
    expect(call.objectId).toBe(CORRESPONDENCE_ID);
    expect(call.action).toBe('Correspondence Reassigned');
    expect(typeof call.timestamp).toBe('string');

    const details = JSON.parse(call.details) as {
      fromUserId: string;
      toUserId: string;
      supervisorId: string;
      reason: string;
      timestamp: string;
    };
    expect(details.fromUserId).toBe(FROM_USER_ID);
    expect(details.toUserId).toBe(TO_USER_ID);
    expect(details.supervisorId).toBe(SUPERVISOR_ID);
    expect(details.reason).toBe('Coverage during leave');
    expect(typeof details.timestamp).toBe('string');
  });

  it('AC4: does not write a CORMS_ReadReceipts row for the new assignee after a successful reassign', async () => {
    const site = makeSite();
    seedCorrespondence(site, 'Public/Unclassified');
    // Pre-seed an unrelated receipt to prove reassign() leaves other rows untouched too.
    seedList(site, 'CORMS_ReadReceipts', [{ Id: 1, CorrespondenceId: CORRESPONDENCE_ID, UserId: 999, ReadAt: '2026-01-01T00:00:00Z' }]);
    const sp = createFakeSp(site);
    const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID]);
    const audit = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, org, audit);

    await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' });

    const receipts = site.lists.CORMS_ReadReceipts.items;
    expect(receipts).toHaveLength(1);
    expect(receipts.some((r) => r.CorrespondenceId === CORRESPONDENCE_ID && r.UserId === Number(TO_USER_ID))).toBe(false);
  });

  it('AC5: getReassignmentsInvolving(originalRecipientId) finds the event through the injected audit contract', async () => {
    const site = makeSite();
    seedCorrespondence(site, 'Public/Unclassified');
    const sp = createFakeSp(site);
    const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID]);
    // The core sees only IAuditTrailService; Elasticsearch transport behavior is covered by the
    // audit service contract tests, while this proves reassignment writes a queryable event.
    const auditTrailService = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, org, auditTrailService);

    await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage' });

    // TODO: surface AuditService.getReassignmentsInvolving() in a visible UI affordance (e.g. a
    // small 'Recently reassigned from you' list or a Detail-view indicator) once that screen's
    // backend work is scheduled — this task provides the queryable capability only.
    const found = await auditTrailService.getReassignmentsInvolving(FROM_USER_ID);

    expect(found).toHaveLength(1);
    expect(found[0].action).toBe('Correspondence Reassigned');
    expect(found[0].objectId).toBe(CORRESPONDENCE_ID);
  });

  it('CMS-040 Part 6: writes a Reassigned CORMS_Timeline row alongside the audit event', async () => {
    const site = makeSite();
    seedCorrespondence(site, 'Public/Unclassified');
    seedList(site, 'CORMS_Timeline', []);
    const sp = createFakeSp(site);
    const org = makeFakeOrgHierarchyService([FROM_USER_ID, TO_USER_ID]);
    const audit = makeFakeAuditTrailService();
    const core = new ReassignmentServiceCore(sp, org, audit);

    await core.reassign({ correspondenceId: CORRESPONDENCE_ID, fromUserId: FROM_USER_ID, toUserId: TO_USER_ID, reason: 'Coverage during leave' });

    const rows = site.lists.CORMS_Timeline.items;
    expect(rows).toHaveLength(1);
    expect(rows[0].CorrespondenceId).toBe(CORRESPONDENCE_ID);
    expect(rows[0].EventType).toBe('Reassigned');
    expect(rows[0].ActorId).toBe(Number(SUPERVISOR_ID));
    expect(rows[0].Description).toContain('Coverage during leave');
  });
});
