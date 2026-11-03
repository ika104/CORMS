import { DelegationServiceCore, IDelegationAttachmentUploadSurface } from '../DelegationServiceCore';
import { IAuditTrailService } from '../../interfaces/IAuditTrailService';
import { createFakeSite, createFakeSp, seedList, IFakeSite } from '../../__tests__/testUtils/fakeSp';

function seedDelegations(site: IFakeSite, rows: Array<{ Id: number } & Record<string, unknown>>): void {
  seedList(site, 'CORMS_Delegations', rows);
}

function seedUserRoles(site: IFakeSite, rows: Array<{ Id: number } & Record<string, unknown>>): void {
  seedList(site, 'CORMS_UserRoles', rows);
}

/** Hand-rolled fake rather than the real AuditTrailServiceCore against fakeSp — keeps
 * DelegationServiceCore's own tests focused on delegation logic, not a second service's. */
function makeFakeAuditTrailService(): IAuditTrailService & { logEvent: jest.Mock } {
  return {
    logEvent: jest.fn().mockResolvedValue({
      id: 'AUD-0001',
      seq: 1,
      objectId: '',
      actor: '',
      action: '',
      details: '',
      timestamp: '',
      category: 'access',
      chainStatus: 'valid',
    }),
    getEntries: jest.fn(),
    getReassignmentsInvolving: jest.fn(),
  };
}

/** Simulates the real two-step upload (create the library item, then Core sets its metadata
 * columns) entirely through the same fake `sp` the Core uses — no separate file/folder mock infra
 * needed, since `items.add({}).then(row => row.Id)` on the shared fakeSp harness plays the exact
 * role a real file upload's resulting IItem.Id would. */
function makeFakeUploadSurface(sp: ReturnType<typeof createFakeSp>): IDelegationAttachmentUploadSurface {
  return {
    uploadFile: async (): Promise<number> => {
      const created = (await sp.web.lists.getByTitle('CORMS_DelegationAttachments').items.add({})) as { Id: number };
      return created.Id;
    },
  };
}

function makeCore(site: IFakeSite, audit = makeFakeAuditTrailService()): { core: DelegationServiceCore; audit: IAuditTrailService & { logEvent: jest.Mock } } {
  const sp = createFakeSp(site);
  return { core: new DelegationServiceCore(sp, audit, makeFakeUploadSurface(sp)), audit };
}

describe('CMS-017 — DelegationServiceCore.create', () => {
  it('AC1: self-service create ignores a spoofed delegator and uses the actual caller', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    const result = await core.create({
      delegator: '999', // spoofed — not the acting user
      delegate: '20',
      reason: 'Vacation',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      isAdmin: false,
      attachments: [],
    });

    expect(result.delegatorId).toBe(String(CURRENT_USER_ID));
    expect(site.lists.CORMS_Delegations.items[0].DelegatorId).toBe(CURRENT_USER_ID);
    expect(site.lists.CORMS_Delegations.items[0].DelegatorId).not.toBe(999);
  });

  it('AC2: admin create is rejected when the caller is not SystemAdministrator', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, [{ Id: 1, UserId: CURRENT_USER_ID, Role: 'Recipient' }]);
    const { core } = makeCore(site);

    await expect(
      core.create({
        delegator: '5',
        delegate: '20',
        reason: 'x',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
        isAdmin: true,
        attachments: [],
      })
    ).rejects.toThrow();

    expect(site.lists.CORMS_Delegations.items).toHaveLength(0);
  });

  it('AC2: admin create succeeds and honors an arbitrary delegator when the caller is SystemAdministrator', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, [{ Id: 1, UserId: CURRENT_USER_ID, Role: 'SystemAdministrator' }]);
    const { core, audit } = makeCore(site);

    const result = await core.create({
      delegator: '55',
      delegate: '20',
      reason: 'Admin-assigned delegation',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      isAdmin: true,
      attachments: [],
    });

    expect(result.delegatorId).toBe('55');
    expect(site.lists.CORMS_Delegations.items[0].DelegatorId).toBe(55);
    expect(audit.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'Delegation Created' }));
  });

  it('Status is always Active on create — both self-service and admin paths', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, [{ Id: 1, UserId: CURRENT_USER_ID, Role: 'SystemAdministrator' }]);
    const { core } = makeCore(site);

    const selfService = await core.create({
      delegator: String(CURRENT_USER_ID),
      delegate: '20',
      reason: 'x',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      isAdmin: false,
      attachments: [],
    });
    const admin = await core.create({
      delegator: '77',
      delegate: '20',
      reason: 'y',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      isAdmin: true,
      attachments: [],
    });

    expect(selfService.status).toBe('Active');
    expect(admin.status).toBe('Active');
    expect(site.lists.CORMS_Delegations.items.every((r) => r.Status === 'Active')).toBe(true);
  });

  it('AC5: attachments with valid FileType are written to CORMS_DelegationAttachments, linked to the new delegation', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    const result = await core.create({
      delegator: String(CURRENT_USER_ID),
      delegate: '20',
      reason: 'Vacation',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      isAdmin: false,
      attachments: [
        { fileName: 'a.pdf', fileType: 'PDF', content: new ArrayBuffer(0) },
        { fileName: 'b.docx', fileType: 'DOCX', content: new ArrayBuffer(0) },
      ],
    });

    const attachments = site.lists.CORMS_DelegationAttachments.items;
    expect(attachments).toHaveLength(2);
    expect(attachments.every((a) => a.DelegationId === result.id)).toBe(true);
    expect(attachments.map((a) => a.FileType).sort()).toEqual(['DOCX', 'PDF']);
  });

  it('rejects a self-service create where delegate equals the acting user (self-delegation)', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    await expect(
      core.create({
        delegator: '',
        delegate: String(CURRENT_USER_ID),
        reason: 'x',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
        isAdmin: false,
        attachments: [],
      })
    ).rejects.toThrow();

    expect(site.lists.CORMS_Delegations.items).toHaveLength(0);
  });

  it('rejects an admin create where delegate equals delegator, even though CreateDelegationModal\'s own picker would normally exclude it', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, [{ Id: 1, UserId: CURRENT_USER_ID, Role: 'SystemAdministrator' }]);
    const { core } = makeCore(site);

    await expect(
      core.create({
        delegator: '55',
        delegate: '55',
        reason: 'x',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
        isAdmin: true,
        attachments: [],
      })
    ).rejects.toThrow();

    expect(site.lists.CORMS_Delegations.items).toHaveLength(0);
  });

  it('rejects an admin create with an unparseable/blank delegator id, even from a confirmed SystemAdministrator', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, [{ Id: 1, UserId: CURRENT_USER_ID, Role: 'SystemAdministrator' }]);
    const { core } = makeCore(site);

    await expect(
      core.create({
        delegator: '',
        delegate: '20',
        reason: 'x',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
        isAdmin: true,
        attachments: [],
      })
    ).rejects.toThrow();

    expect(site.lists.CORMS_Delegations.items).toHaveLength(0);
  });

  it('AC5: an attachment with an invalid FileType rejects create() cleanly — nothing is written', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    seedList(site, 'CORMS_DelegationAttachments', []);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    await expect(
      core.create({
        delegator: String(CURRENT_USER_ID),
        delegate: '20',
        reason: 'Vacation',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        isAdmin: false,
        attachments: [
          { fileName: 'a.pdf', fileType: 'PDF', content: new ArrayBuffer(0) },
          { fileName: 'evil.exe', fileType: 'EXE', content: new ArrayBuffer(0) },
        ],
      })
    ).rejects.toThrow();

    expect(site.lists.CORMS_Delegations.items).toHaveLength(0);
    expect(site.lists.CORMS_DelegationAttachments.items).toHaveLength(0);
  });
});

describe('CMS-017 — DelegationServiceCore.revoke (AC10)', () => {
  it('sets Status to Revoked without deleting the row, when the caller is CreatedBy', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedDelegations(site, [{ Id: 1, DelegatorId: 99, CreatedById: CURRENT_USER_ID, Status: 'Active' }]);
    seedUserRoles(site, []);
    const { core, audit } = makeCore(site);

    await core.revoke('1', 'no longer needed');

    expect(site.lists.CORMS_Delegations.items).toHaveLength(1);
    expect(site.lists.CORMS_Delegations.items[0].Status).toBe('Revoked');
    expect(audit.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'Delegation Revoked' }));
  });

  it('is authorized for the Delegator too', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedDelegations(site, [{ Id: 1, DelegatorId: CURRENT_USER_ID, CreatedById: 99, Status: 'Active' }]);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    await core.revoke('1', 'x');

    expect(site.lists.CORMS_Delegations.items[0].Status).toBe('Revoked');
  });

  it('is authorized for a SystemAdministrator caller even when neither CreatedBy nor Delegator', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedDelegations(site, [{ Id: 1, DelegatorId: 99, CreatedById: 88, Status: 'Active' }]);
    seedUserRoles(site, [{ Id: 1, UserId: CURRENT_USER_ID, Role: 'SystemAdministrator' }]);
    const { core } = makeCore(site);

    await core.revoke('1', 'x');

    expect(site.lists.CORMS_Delegations.items[0].Status).toBe('Revoked');
  });

  it('throws for an unauthorized caller and leaves the row untouched', async () => {
    const CURRENT_USER_ID = 10;
    const site = createFakeSite(CURRENT_USER_ID);
    seedDelegations(site, [{ Id: 1, DelegatorId: 99, CreatedById: 88, Status: 'Active' }]);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    await expect(core.revoke('1', 'x')).rejects.toThrow();
    expect(site.lists.CORMS_Delegations.items[0].Status).toBe('Active');
  });
});

describe('CMS-017 — DelegationServiceCore.listMine / listAll (AC6)', () => {
  function seedTwoDelegatorRows(site: IFakeSite): void {
    seedDelegations(site, [
      {
        Id: 1,
        Delegator: { Id: 10, Title: 'Ali Al-Rashid' },
        DelegatorId: 10,
        Delegate: { Id: 20, Title: 'Yahya Mohamed' },
        DelegateId: 20,
        Reason: 'Annual leave',
        StartDate: '2026-01-01',
        EndDate: '2026-01-10',
        Status: 'Active',
        CreatedBy: { Id: 10, Title: 'Ali Al-Rashid' },
        CreatedById: 10,
      },
      {
        Id: 2,
        Delegator: { Id: 10, Title: 'Ali Al-Rashid' },
        DelegatorId: 10,
        Delegate: { Id: 30, Title: 'Layla Hassan' },
        DelegateId: 30,
        Reason: 'Medical leave',
        StartDate: '2026-02-01',
        EndDate: '2026-02-10',
        Status: 'Active',
        CreatedBy: { Id: 10, Title: 'Ali Al-Rashid' },
        CreatedById: 10,
      },
      {
        Id: 3,
        Delegator: { Id: 40, Title: 'Sara Al-Mansour' },
        DelegatorId: 40,
        Delegate: { Id: 50, Title: 'Ahmed Nasser' },
        DelegateId: 50,
        Reason: 'Training',
        StartDate: '2026-03-01',
        EndDate: '2026-03-05',
        Status: 'Active',
        CreatedBy: { Id: 40, Title: 'Sara Al-Mansour' },
        CreatedById: 40,
      },
    ]);
  }

  it('listMine matches search on delegator name, delegate name, and reason individually', async () => {
    // CURRENT_USER_ID 10 matches rows 1 and 2's DelegatorId — listMine resolves the acting user
    // server-side (getCurrentSiteUserId), it no longer takes a delegator id from the caller.
    const site = createFakeSite(10);
    seedTwoDelegatorRows(site);
    const { core } = makeCore(site);

    expect((await core.listMine({ search: 'Ali' })).map((r) => r.id).sort()).toEqual(['1', '2']);
    expect((await core.listMine({ search: 'Layla' })).map((r) => r.id)).toEqual(['2']);
    expect((await core.listMine({ search: 'Medical' })).map((r) => r.id)).toEqual(['2']);
    expect(await core.listMine({ search: 'zzz-no-match' })).toEqual([]);
  });

  it('listMine only returns rows for the acting user (not another delegator present in the list)', async () => {
    const site = createFakeSite(10);
    seedTwoDelegatorRows(site);
    const { core } = makeCore(site);

    const mine = await core.listMine();
    expect(mine.map((r) => r.id).sort()).toEqual(['1', '2']);
  });

  it('listAll returns rows across all delegators and applies the same search filter', async () => {
    const site = createFakeSite();
    seedTwoDelegatorRows(site);
    const { core } = makeCore(site);

    const all = await core.listAll();
    expect(all).toHaveLength(3);

    const filtered = await core.listAll({ search: 'Sara' });
    expect(filtered.map((r) => r.id)).toEqual(['3']);
  });
});

describe('CMS-017 — DelegationServiceCore.getAuditSummary / getDelegationLedger (AC7)', () => {
  it('getAuditSummary aggregates Total/Active("accepted")/Rejected/Revoked grouped by CreatedBy', async () => {
    const site = createFakeSite();
    seedDelegations(site, [
      { Id: 1, CreatedBy: { Id: 10, Title: 'Ali' }, CreatedById: 10, Status: 'Active' },
      { Id: 2, CreatedBy: { Id: 10, Title: 'Ali' }, CreatedById: 10, Status: 'Revoked' },
      { Id: 3, CreatedBy: { Id: 10, Title: 'Ali' }, CreatedById: 10, Status: 'Rejected' },
      { Id: 4, CreatedBy: { Id: 40, Title: 'Sara' }, CreatedById: 40, Status: 'Active' },
    ]);
    seedUserRoles(site, [
      { Id: 1, UserId: 10, Department: 'CEO Office' },
      { Id: 2, UserId: 40, Department: 'Finance' },
    ]);
    const { core } = makeCore(site);

    const summary = await core.getAuditSummary();

    expect(summary.find((r) => r.userId === '10')).toEqual({
      userId: '10',
      userName: 'Ali',
      team: 'CEO Office',
      totalCreated: 3,
      accepted: 1,
      rejected: 1,
      revoked: 1,
    });
    expect(summary.find((r) => r.userId === '40')).toEqual({
      userId: '40',
      userName: 'Sara',
      team: 'Finance',
      totalCreated: 1,
      accepted: 1,
      rejected: 0,
      revoked: 0,
    });
  });

  it('getDelegationLedger returns delegation+attachments joined, with its own search/team filter independent of listMine/listAll', async () => {
    // Acting user is 10 — same user whose ledger is being read (a self-view), so this test's own
    // focus (the join/search/team filter logic) doesn't trip the authorization gate covered
    // separately below.
    const site = createFakeSite(10);
    seedDelegations(site, [
      {
        Id: 1,
        Delegator: { Id: 10, Title: 'Ali' },
        DelegatorId: 10,
        Delegate: { Id: 20, Title: 'Yahya' },
        DelegateId: 20,
        Reason: 'Leave',
        StartDate: '2026-01-01',
        EndDate: '2026-01-10',
        Status: 'Active',
        CreatedBy: { Id: 10, Title: 'Ali' },
        CreatedById: 10,
      },
      {
        Id: 2,
        Delegator: { Id: 40, Title: 'Sara' },
        DelegatorId: 40,
        Delegate: { Id: 50, Title: 'Ahmed' },
        DelegateId: 50,
        Reason: 'Training',
        StartDate: '2026-02-01',
        EndDate: '2026-02-05',
        Status: 'Active',
        CreatedBy: { Id: 40, Title: 'Sara' },
        CreatedById: 40,
      },
    ]);
    seedList(site, 'CORMS_DelegationAttachments', [
      {
        Id: 1,
        DelegationId: '1',
        FileName: 'a.pdf',
        FileType: 'PDF',
        UploadedBy: { Id: 10, Title: 'Ali' },
        UploadedById: 10,
        UploadedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    seedUserRoles(site, [{ Id: 1, UserId: 10, Department: 'CEO Office' }]);
    const { core } = makeCore(site);

    const ledger = await core.getDelegationLedger('10');
    expect(ledger).toHaveLength(1);
    expect(ledger[0].id).toBe('1');
    expect(ledger[0].attachments).toHaveLength(1);
    expect(ledger[0].attachments[0].fileName).toBe('a.pdf');

    const searched = await core.getDelegationLedger('10', { search: 'Leave' });
    expect(searched).toHaveLength(1);
    const noMatch = await core.getDelegationLedger('10', { search: 'zzz-no-match' });
    expect(noMatch).toEqual([]);

    const wrongTeam = await core.getDelegationLedger('10', { team: 'Finance' });
    expect(wrongTeam).toEqual([]);
    const rightTeam = await core.getDelegationLedger('10', { team: 'CEO Office' });
    expect(rightTeam).toHaveLength(1);
  });

  // getDelegationLedger isn't wired into any UI yet (see DelegationView.tsx's TODO), but the
  // caller-supplied `userId` still needs the same "not trusted on its own" treatment every other
  // refactored method in this class gets — these prove that hole is closed.
  it('getDelegationLedger rejects a non-admin caller requesting another user\'s ledger', async () => {
    const site = createFakeSite(1); // not user 10, and no SystemAdministrator role
    seedDelegations(site, [{ Id: 1, DelegatorId: 10, CreatedById: 10, Status: 'Active', Reason: 'x' }]);
    seedUserRoles(site, []);
    const { core } = makeCore(site);

    await expect(core.getDelegationLedger('10')).rejects.toThrow();
  });

  it('getDelegationLedger allows a SystemAdministrator caller to read another user\'s ledger', async () => {
    const site = createFakeSite(1);
    seedDelegations(site, [{ Id: 1, DelegatorId: 10, CreatedById: 10, Status: 'Active', Reason: 'x' }]);
    seedUserRoles(site, [{ Id: 1, UserId: 1, Role: 'SystemAdministrator' }]);
    const { core } = makeCore(site);

    await expect(core.getDelegationLedger('10')).resolves.toHaveLength(1);
  });
});

describe('CMS-017 — DelegationServiceCore.listDirectory', () => {
  it('maps every CORMS_UserRoles row to IDirectoryPerson, unfiltered', async () => {
    const site = createFakeSite();
    seedUserRoles(site, [
      { Id: 1, User: { Id: 10, Title: 'Ali' }, Role: 'SupervisorManager', Department: 'CEO Office', ClearanceTier: 5 },
      { Id: 2, User: { Id: 20, Title: 'Yahya' }, Role: 'Recipient', Department: 'Ops' },
    ]);
    const { core } = makeCore(site);

    const directory = await core.listDirectory();

    expect(directory).toHaveLength(2);
    expect(directory.find((p) => p.id === '10')).toEqual({ id: '10', displayName: 'Ali', team: 'CEO Office', clearanceTier: 5, isSupervisor: true });
    expect(directory.find((p) => p.id === '20')).toEqual({ id: '20', displayName: 'Yahya', team: 'Ops', clearanceTier: 1, isSupervisor: false });
  });
});
