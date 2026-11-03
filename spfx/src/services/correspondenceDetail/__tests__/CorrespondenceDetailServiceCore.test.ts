import { CorrespondenceDetailServiceCore } from '../CorrespondenceDetailServiceCore';
import { isAccessDenied } from '../../interfaces/ICorrespondenceDetailService';
import {
  createFakeSite,
  createFakeSp,
  seedList,
  seedRoleAssignments,
} from '../../__tests__/testUtils/fakeSp';
import { InMemoryAuditTrailService } from './testUtils/InMemoryAuditTrailService';
import { AttachmentStorageServiceCore } from '../../attachments/AttachmentStorageServiceCore';

const CURRENT_USER_ID = 10;

function seedCorrespondenceItem(
  site: ReturnType<typeof createFakeSite>,
  overrides: Record<string, unknown> = {}
): void {
  seedList(site, 'CORMS_Correspondence', [
    {
      Id: 1,
      Title: 'Budget Approval',
      ReferenceNo: 'REF-1',
      Direction: 'Incoming',
      CorrespondenceType: 'Letter',
      Priority: 'Normal',
      SecurityLevel: 'Public/Unclassified',
      DestinationDepartments: 'Finance',
      Sender: { Title: 'Alice' },
      Recipient: 'Bob',
      AssignedTo: { Title: 'Charlie' },
      DateCreated: '2026-01-01T00:00:00Z',
      Status: 'Registered',
      OriginatingFunction: 'Finance',
      CommentsNotes: 'Please review',
      RecordClassification: 'RC-1',
      ThreadId: 'THREAD-1',
      ...overrides,
    },
  ]);
}

function makeCore(
  site: ReturnType<typeof createFakeSite>,
  clearanceTier = 5,
  auditTrailService = new InMemoryAuditTrailService()
): CorrespondenceDetailServiceCore {
  return new CorrespondenceDetailServiceCore(
    createFakeSp(site),
    async () => clearanceTier,
    auditTrailService
  );
}

function seedEmptySupportLists(site: ReturnType<typeof createFakeSite>): void {
  seedList(site, 'CORMS_Timeline', []);
  seedList(site, 'CORMS_Attachments', []);
  seedList(site, 'CORMS_PhysicalAttachments', []);
}

describe('CMS-040 Part 1 — getDetail (header/Details-tab fields only)', () => {
  it('happy path maps CORMS_Correspondence fields onto the detail model', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const core = makeCore(site);

    const result = await core.getDetail('1');

    expect(result).toBeDefined();
    expect(isAccessDenied(result)).toBe(false);
    if (!result || isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.subject).toBe('Budget Approval');
    expect(result.referenceNumber).toBe('REF-1');
    expect(result.originatingFunction).toBe('Finance');
    expect(result.comment).toBe('Please review');
    // Attachments/Security/Audit/Timeline/Thread/Reminder each moved to their own method — getDetail
    // no longer carries any of that data.
    expect('attachments' in result).toBe(false);
    expect('timeline' in result).toBe(false);
    expect('auditSeed' in result).toBe(false);
  });

  it('surfaces Content Type (ContentTypeName) and Channel on the detail for the Details tab', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { ContentTypeName: 'Memo', Channel: 'Fax' });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    const result = await core.getDetail('1');
    if (!result || isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.contentType).toBe('Memo');
    expect(result.channel).toBe('Fax');
  });

  it('leaves Channel undefined when the column is absent (not-yet-provisioned tenant) rather than failing', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site); // no Channel column seeded
    seedEmptySupportLists(site);
    const core = makeCore(site);

    const result = await core.getDetail('1');
    if (!result || isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.channel).toBeUndefined();
    // The rest of the Details tab still resolves normally.
    expect(result.subject).toBe('Budget Approval');
  });

  it('AC9: returns an access-denied result — with no metadata — when clearance is insufficient', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { SecurityLevel: 'Top Secret' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 1);

    const result = await core.getDetail('1');

    expect(result).toEqual({ accessDenied: true });
    expect(Object.keys(result as object)).toEqual(['accessDenied']);
  });

  it("CMS-017 AC9: clearance is resolved from the acting user's own context — a delegation does not change it (the delegate stays denied even when the delegator has higher clearance)", async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { SecurityLevel: 'Top Secret' });
    seedEmptySupportLists(site);
    seedList(site, 'CORMS_Delegations', [
      {
        Id: 1,
        DelegatorId: 999,
        DelegateId: CURRENT_USER_ID,
        Status: 'Active',
        StartDate: '2020-01-01T00:00:00Z',
        EndDate: '2099-01-01T00:00:00Z',
      },
    ]);
    const core = makeCore(site, 1);

    const result = await core.getDetail('1');

    expect(result).toEqual({ accessDenied: true });
  });

  it('returns undefined for a non-existent id (not found, distinct from access-denied)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', []);
    const core = makeCore(site);

    const result = await core.getDetail('999');

    expect(result).toBeUndefined();
  });

  it('writes a "Viewed Details" event through the audit service without touching CORMS_AuditLog', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    await core.getDetail('1');

    expect(auditTrailService.entries).toHaveLength(1);
    expect(auditTrailService.entries[0].objectId).toBe('1');
    expect(auditTrailService.entries[0].action).toBe('Viewed Details');
    expect(auditTrailService.entries[0].actor).toBe(String(CURRENT_USER_ID));
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });
});

describe('CMS-040 Part 1 — every tab method independently re-checks clearance (AC9)', () => {
  function seedDeniedItem(site: ReturnType<typeof createFakeSite>): void {
    seedCorrespondenceItem(site, { SecurityLevel: 'Top Secret' });
    seedEmptySupportLists(site);
  }

  it('getAttachments denies with the same shape, called directly (no prior getDetail call)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const core = makeCore(site, 1);

    const result = await core.getAttachments('1');

    expect(result).toEqual({ accessDenied: true });
  });

  it('getSecurityAssignments denies with the same shape, called directly', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const core = makeCore(site, 1);

    expect(await core.getSecurityAssignments('1')).toEqual({ accessDenied: true });
  });

  it('getAuditTrail denies with the same shape, called directly', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const core = makeCore(site, 1);

    expect(await core.getAuditTrail('1')).toEqual({ accessDenied: true });
  });

  it('getTimeline denies with the same shape, called directly', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const core = makeCore(site, 1);

    expect(await core.getTimeline('1')).toEqual({ accessDenied: true });
  });

  it('getThread denies with the same shape, called directly', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const core = makeCore(site, 1);

    expect(await core.getThread('1', 'THREAD-1')).toEqual({ accessDenied: true });
  });

  it('getReminder denies with the same shape, called directly', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const core = makeCore(site, 1);

    expect(await core.getReminder('1')).toEqual({ accessDenied: true });
  });

  it('none of the 7 denied calls writes an audit event — a denied caller leaves no trace of the data it was denied', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedDeniedItem(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 1, auditTrailService);

    await Promise.all([
      core.getDetail('1'),
      core.getAttachments('1'),
      core.getSecurityAssignments('1'),
      core.getAuditTrail('1'),
      core.getTimeline('1'),
      core.getThread('1', 'THREAD-1'),
      core.getReminder('1'),
    ]);

    expect(auditTrailService.entries).toHaveLength(0);
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });

  it('every method writes its own "Viewed {Tab}" row once clearance passes', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    await core.getAttachments('1');
    await core.getSecurityAssignments('1');
    await core.getAuditTrail('1');
    await core.getTimeline('1');
    await core.getThread('1', 'THREAD-1');
    await core.getReminder('1');

    const actions = auditTrailService.entries.map((entry) => entry.action);
    expect(actions).toEqual([
      'Viewed Attachments',
      'Viewed Security',
      'Viewed Audit',
      'Viewed Timeline',
      'Viewed Thread',
      'Viewed Reminder',
    ]);
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });
});

describe('CMS-040 Part 2 — getAttachments', () => {
  it('joins CORMS_Attachments (Uploaded/Scanned/RecordHubReference) with CORMS_PhysicalAttachments, main-letter flag correct', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedList(site, 'CORMS_Timeline', []);
    seedList(site, 'CORMS_Attachments', [
      { Id: 1, CorrespondenceId: '1', FileName: 'main.pdf', IsMainLetter: true, Source: 'Uploaded' },
      { Id: 2, CorrespondenceId: '1', FileName: 'scan.pdf', IsMainLetter: false, Source: 'Scanned' },
      {
        Id: 3,
        CorrespondenceId: '1',
        FileName: 'ref.pdf',
        IsMainLetter: false,
        Source: 'RecordHubReference',
        RecordHubReferenceNumber: 'RH-1',
      },
      { Id: 4, CorrespondenceId: '2', FileName: 'other-item.pdf', IsMainLetter: true, Source: 'Uploaded' },
    ]);
    seedList(site, 'CORMS_PhysicalAttachments', [
      {
        Id: 1,
        CorrespondenceId: '1',
        ResourceIdentifier: 'PHY-2026-0001',
        StorageLocation: 'Shelf A',
        Description: 'Signed original',
      },
    ]);
    const core = makeCore(site);

    const result = await core.getAttachments('1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.uploaded.map((a) => a.name).sort()).toEqual(['main.pdf', 'ref.pdf', 'scan.pdf']);
    expect(result.uploaded.find((a) => a.name === 'main.pdf')?.isMain).toBe(true);
    expect(result.uploaded.find((a) => a.name === 'scan.pdf')?.isMain).toBe(false);
    expect(result.uploaded.find((a) => a.name === 'ref.pdf')?.source).toBe('RecordHubReference');
    expect(result.physical).toEqual([
      {
        id: '1',
        resourceIdentifier: 'PHY-2026-0001',
        storageLocation: 'Shelf A',
        description: 'Signed original',
      },
    ]);
  });

  it('resolves url as undefined (not fabricated) when no attachmentStorage is injected', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedList(site, 'CORMS_Timeline', []);
    seedList(site, 'CORMS_Attachments', [
      { Id: 1, CorrespondenceId: '1', FileName: 'main.pdf', IsMainLetter: true, Source: 'Uploaded' },
    ]);
    seedList(site, 'CORMS_PhysicalAttachments', []);
    const core = makeCore(site);

    const result = await core.getAttachments('1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.uploaded[0].url).toBeUndefined();
  });

  it('includes a supporting file that is present in the correspondence folder even when its metadata row is missing', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedList(site, 'CORMS_Timeline', []);
    seedList(site, 'CORMS_Attachments', [
      { Id: 1, CorrespondenceId: '1', FileName: 'main.pdf', IsMainLetter: true, Source: 'Uploaded' },
    ]);
    seedList(site, 'CORMS_PhysicalAttachments', []);
    const storage = new AttachmentStorageServiceCore({
      ensureFolder: async () => undefined,
      uploadFile: async () => ({ fileName: '', serverRelativeUrl: '' }),
      replaceFile: async () => undefined,
      listFiles: async () => [
        { fileName: 'main.pdf', serverRelativeUrl: '/sites/CORMS/CORMS_Attachments/2026/01/REF-1/main.pdf' },
        {
          fileName: 'supporting.pdf',
          serverRelativeUrl: '/sites/CORMS/CORMS_Attachments/2026/01/REF-1/supporting.pdf',
        },
      ],
    });
    const core = new CorrespondenceDetailServiceCore(
      createFakeSp(site),
      async () => 5,
      new InMemoryAuditTrailService(),
      undefined,
      storage
    );

    const result = await core.getAttachments('1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.uploaded.map((attachment) => attachment.name)).toEqual(['main.pdf', 'supporting.pdf']);
    expect(result.uploaded.find((attachment) => attachment.name === 'supporting.pdf')).toEqual(
      expect.objectContaining({
        isMain: false,
        url: '/sites/CORMS/CORMS_Attachments/2026/01/REF-1/supporting.pdf',
      })
    );
  });
});

describe('CMS-040 Part 3 — getSecurityAssignments (real SharePoint role assignments)', () => {
  it('maps a mocked roleAssignments REST response to principal/permissionLevel/type', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    seedRoleAssignments(site, 'CORMS_Correspondence', 1, [
      {
        PrincipalId: 10,
        Member: { Title: 'Layla Hassan', PrincipalType: 1 },
        RoleDefinitionBindings: [{ Name: 'Edit' }],
      },
      {
        PrincipalId: 20,
        Member: { Title: 'Finance Team', PrincipalType: 8 },
        RoleDefinitionBindings: [{ Name: 'Read' }, { Name: 'Contribute' }],
      },
    ]);
    const core = makeCore(site);

    const result = await core.getSecurityAssignments('1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(result).toEqual([
      { id: '10', principal: 'Layla Hassan', permissionLevel: 'Edit', type: 'User' },
      { id: '20', principal: 'Finance Team', permissionLevel: 'Read, Contribute', type: 'SharePoint Group' },
    ]);
  });

  it('an item with no role assignments seeded returns an empty array, not an error', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const core = makeCore(site);

    expect(await core.getSecurityAssignments('1')).toEqual([]);
  });
});

describe('CMS-040 Part 4 — getAuditTrail', () => {
  it('requests the object-scoped entries from the audit service and maps the detail-row shape', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedList(site, 'CORMS_Timeline', []);
    seedList(site, 'CORMS_Attachments', []);
    seedList(site, 'CORMS_PhysicalAttachments', []);
    const auditTrailService = new InMemoryAuditTrailService([
      {
        id: 'audit-1',
        seq: 1,
        objectId: '1',
        actor: 'X',
        action: 'Created',
        details: 'Created',
        timestamp: '2026-01-01T00:00:00Z',
        category: 'correspondence',
        chainStatus: 'valid',
      },
      {
        id: 'audit-2',
        seq: 2,
        objectId: '2',
        actor: 'X',
        action: 'Created',
        details: 'Different item',
        timestamp: '2026-01-01T00:00:00Z',
        category: 'correspondence',
        chainStatus: 'valid',
      },
    ]);
    const core = makeCore(site, 5, auditTrailService);

    const result = await core.getAuditTrail('1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(auditTrailService.queries).toEqual([{ objectId: '1' }]);
    expect(result).toEqual([
      {
        id: 'audit-1',
        seq: 1,
        actor: 'X',
        action: 'Created',
        details: 'Created',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });
});

describe('CMS-040 Part 6/Timeline reader — getTimeline', () => {
  it('orders CORMS_Timeline rows by EventTimestamp ascending, including the new Reassigned kind', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedList(site, 'CORMS_Attachments', []);
    seedList(site, 'CORMS_PhysicalAttachments', []);
    seedList(site, 'CORMS_Timeline', [
      {
        Id: 1,
        CorrespondenceId: '1',
        EventType: 'Signed',
        Actor: { Title: 'X' },
        Description: 'Signed',
        EventTimestamp: '2026-01-04T00:00:00Z',
      },
      {
        Id: 2,
        CorrespondenceId: '1',
        EventType: 'Created',
        Actor: { Title: 'X' },
        Description: 'Created',
        EventTimestamp: '2026-01-01T00:00:00Z',
      },
      {
        Id: 3,
        CorrespondenceId: '1',
        EventType: 'Submitted',
        Actor: { Title: 'X' },
        Description: 'Submitted',
        EventTimestamp: '2026-01-02T00:00:00Z',
      },
      {
        Id: 4,
        CorrespondenceId: '1',
        EventType: 'Reassigned',
        Actor: { Title: 'X' },
        Description: 'Reassigned',
        EventTimestamp: '2026-01-03T00:00:00Z',
      },
    ]);
    const core = makeCore(site);

    const result = await core.getTimeline('1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.map((e) => e.kind)).toEqual(['created', 'submitted', 'reassigned', 'signed']);
  });
});

describe('CMS-040 Part 7 — getThread', () => {
  it('only returns items sharing the given ThreadId', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      {
        Id: 1,
        Title: 'A',
        ThreadId: 'THREAD-1',
        DateCreated: '2026-01-01T00:00:00Z',
        SecurityLevel: 'Public/Unclassified',
        Status: 'Registered',
      },
      {
        Id: 2,
        Title: 'B',
        ThreadId: 'THREAD-1',
        DateCreated: '2026-01-02T00:00:00Z',
        SecurityLevel: 'Public/Unclassified',
        Status: 'Registered',
      },
      {
        Id: 3,
        Title: 'C',
        ThreadId: 'THREAD-2',
        DateCreated: '2026-01-01T00:00:00Z',
        SecurityLevel: 'Public/Unclassified',
        Status: 'Registered',
      },
    ]);
    const core = makeCore(site);

    const result = await core.getThread('1', 'THREAD-1');

    if (isAccessDenied(result)) throw new Error('expected ok result');
    expect(result.map((i) => i.subject)).toEqual(['A', 'B']);
  });

  it('denies when the *opened* item is over-clearance, even though an individual chain item is not', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      {
        Id: 1,
        Title: 'A (Top Secret)',
        ThreadId: 'THREAD-1',
        DateCreated: '2026-01-01T00:00:00Z',
        SecurityLevel: 'Top Secret',
        Status: 'Registered',
      },
      {
        Id: 2,
        Title: 'B (Public)',
        ThreadId: 'THREAD-1',
        DateCreated: '2026-01-02T00:00:00Z',
        SecurityLevel: 'Public/Unclassified',
        Status: 'Registered',
      },
    ]);
    const core = makeCore(site, 1); // low clearance

    const result = await core.getThread('1', 'THREAD-1');

    expect(result).toEqual({ accessDenied: true });
  });
});

describe('CMS-042 — follow-up reminders', () => {
  it('getReminder returns undefined when no reminder is set (AC4), and audit-logs the view', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    expect(await core.getReminder('1')).toBeUndefined();
    expect(auditTrailService.entries[0].action).toBe('Viewed Reminder');
  });

  it('getReminder reads a reminder already stored on the item (AC4), normalizing the date', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, {
      ReminderDate: '2026-09-10T00:00:00Z',
      ReminderType: 'Escalation Notice',
      ReminderNote: 'No response after 14 days',
    });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    expect(await core.getReminder('1')).toEqual({
      date: '2026-09-10',
      followUpType: 'Escalation Notice',
      note: 'No response after 14 days',
    });
  });

  it('saveReminder persists the reminder (AC2) and records a ReminderSet timeline event (AC7)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Direction: 'Outgoing' });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    await core.saveReminder('1', { date: '2026-09-10', followUpType: '2nd Follow-up Letter', note: 'chase' });

    const item = site.lists.CORMS_Correspondence.items[0];
    expect(item.ReminderDate).toBe('2026-09-10');
    expect(item.ReminderType).toBe('2nd Follow-up Letter');
    expect(item.ReminderNote).toBe('chase');
    const event = site.lists.CORMS_Timeline.items[0];
    expect(event.EventType).toBe('ReminderSet');
    expect(String(event.Description)).toContain('2nd Follow-up Letter');
    // round-trips back through getReminder
    expect(await core.getReminder('1')).toEqual({
      date: '2026-09-10',
      followUpType: '2nd Follow-up Letter',
      note: 'chase',
    });
  });

  it('saveReminder rejects a missing date without writing anything (AC5)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Direction: 'Outgoing' });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    await core.saveReminder('1', { date: '', followUpType: '1st Follow-up', note: '' });

    expect(site.lists.CORMS_Correspondence.items[0].ReminderDate).toBeUndefined();
    expect(site.lists.CORMS_Timeline.items).toHaveLength(0);
  });

  it('clearReminder blanks the reminder on the item (AC4)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, {
      Direction: 'Outgoing',
      ReminderDate: '2026-09-10T00:00:00Z',
      ReminderType: '1st Follow-up',
      ReminderNote: 'x',
    });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    await core.clearReminder('1');

    expect(site.lists.CORMS_Correspondence.items[0].ReminderDate).toBeNull();
    expect(await core.getReminder('1')).toBeUndefined();
  });

  it('saveReminder denies below-clearance callers with the access-denied shape', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Direction: 'Outgoing', SecurityLevel: 'Top Secret' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 1);

    expect(
      await core.saveReminder('1', { date: '2026-09-10', followUpType: '1st Follow-up', note: '' })
    ).toEqual({
      accessDenied: true,
    });
    expect(site.lists.CORMS_Timeline.items).toHaveLength(0);
  });
});

describe('CMS-040 — updateDetails (inline Details edit)', () => {
  it('persists the Comments edit and writes the mandatory change comment to the audit trail', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    const result = await core.updateDetails(
      '1',
      { comment: 'Please expedite handling' },
      'Corrected the handling note'
    );

    expect(isAccessDenied(result)).toBe(false);
    expect(site.lists.CORMS_Correspondence.items[0].CommentsNotes).toBe('Please expedite handling');
    const audit = auditTrailService.entries.find((e) => e.action === 'Details Edited');
    expect(audit).toBeDefined();
    expect(audit?.details).toContain('Corrected the handling note');
  });

  it('persists a typed multi-field edit and records the exact before → after in the audit', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { DueDate: '2026-09-23T00:00:00Z' });
    seedEmptySupportLists(site);
    site.ensuredUsers = { 'i:0#.f|membership|zyad': 77 };
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    const result = await core.updateDetails(
      '1',
      {
        originatingFunction: 'Legal Affairs',
        dueDate: '2026-09-30',
        assignedTo: { login: 'i:0#.f|membership|zyad', name: 'zyad' },
        comment: 'Escalated to legal',
      },
      'Handover to legal team'
    );

    expect(isAccessDenied(result)).toBe(false);
    const item = site.lists.CORMS_Correspondence.items[0];
    expect(item.OriginatingFunction).toBe('Legal Affairs');
    expect(item.DueDate).toBe('2026-09-30');
    expect(item.CommentsNotes).toBe('Escalated to legal');
    expect(item.AssignedToId).toBe(77);
    const audit = auditTrailService.entries.find((e) => e.action === 'Details Edited');
    expect(audit?.details).toBe(
      'Originating Function: Finance → Legal Affairs; Due Date: 23/09/2026 → 30/09/2026; ' +
        'Assigned To: Charlie → zyad; Comments: Please review → Escalated to legal — Handover to legal team'
    );
  });

  it('skips an Assigned To whose person cannot be resolved, still saving the other fields', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    // No ensuredUsers entry for this login → ensureUser throws → the person change is dropped.
    const result = await core.updateDetails(
      '1',
      {
        originatingFunction: 'Legal Affairs',
        assignedTo: { login: 'i:0#.f|membership|ghost', name: 'Nobody' },
      },
      'note'
    );

    expect(isAccessDenied(result)).toBe(false);
    const item = site.lists.CORMS_Correspondence.items[0];
    expect(item.OriginatingFunction).toBe('Legal Affairs');
    expect(item.AssignedToId).toBeUndefined();
    const audit = auditTrailService.entries.find((e) => e.action === 'Details Edited');
    // The unresolved person is absent from the audit — only what actually persisted is recorded.
    expect(audit?.details).toBe('Originating Function: Finance → Legal Affairs — note');
  });

  it('denies the edit when the item is above the caller clearance', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { SecurityLevel: 'Top Secret' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 1);

    const result = await core.updateDetails('1', { comment: 'changed' }, 'note');

    expect(isAccessDenied(result)).toBe(true);
    // The edit never touched the item — its seeded Comments value is unchanged.
    expect(site.lists.CORMS_Correspondence.items[0].CommentsNotes).toBe('Please review');
  });
});

describe('CMS-006 — setStatus / addTimelineEntry (approval persistence)', () => {
  it('setStatus persists the correspondence Status and audits it', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Status: 'InReview' });
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    const result = await core.setStatus('1', 'Approved');

    expect(isAccessDenied(result)).toBe(false);
    expect(site.lists.CORMS_Correspondence.items[0].Status).toBe('Approved');
    expect(auditTrailService.entries.find((e) => e.action === 'Status Changed')?.details).toContain(
      'Approved'
    );
  });

  it("setStatus writes the list's 'In Review' choice, not the model's 'InReview' token", async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Status: 'Draft' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 5);

    await core.setStatus('1', 'InReview');

    expect(site.lists.CORMS_Correspondence.items[0].Status).toBe('In Review');
  });

  it('setStatus denies (and writes nothing) when the item is above the caller clearance', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { SecurityLevel: 'Top Secret', Status: 'InReview' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 1);

    expect(isAccessDenied(await core.setStatus('1', 'Approved'))).toBe(true);
    expect(site.lists.CORMS_Correspondence.items[0].Status).toBe('InReview');
  });

  it('addTimelineEntry appends a CORMS_Timeline row (who did what) for every viewer', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const core = makeCore(site, 5);

    const result = await core.addTimelineEntry('1', 'Approved', 'Step 2 approved by Layla Hassan');

    expect(isAccessDenied(result)).toBe(false);
    const row = site.lists.CORMS_Timeline.items.find((r) => r.CorrespondenceId === '1');
    expect(row?.EventType).toBe('Approved');
    expect(row?.Description).toBe('Step 2 approved by Layla Hassan');
  });
});

describe('Declare Record — templates are optional', () => {
  it('declares an approved OUTGOING item with no TemplateReference', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Direction: 'Outgoing', Status: 'Approved' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 5);

    const result = await core.declareRecord('1', 'Layla Hassan');

    expect(isAccessDenied(result)).toBe(false);
    const item = site.lists.CORMS_Correspondence.items[0];
    expect(item.Status).toBe('Declared');
    expect(item.DeclaredBy).toBe('Layla Hassan');
    expect(site.lists.CORMS_Timeline.items).toHaveLength(1);
  });

  it('also retains the normal declaration path for an OUTGOING item with template provenance', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, {
      Direction: 'Outgoing',
      Status: 'Approved',
      TemplateReference: 'tpl-1',
      TemplateVersion: 2,
    });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    const result = await core.declareRecord('1', 'Layla Hassan');

    if (isAccessDenied(result)) throw new Error('expected a declaration result');
    expect(result.declaredBy).toBe('Layla Hassan');
    expect(site.lists.CORMS_Correspondence.items[0].Status).toBe('Declared');
  });

  it('never gates an INCOMING item — incoming is scanned/uploaded and out of scope (AC2)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { Direction: 'Incoming', Status: 'Approved' });
    seedEmptySupportLists(site);
    const core = makeCore(site);

    const result = await core.declareRecord('1', 'Layla Hassan');

    expect(isAccessDenied(result)).toBe(false);
    expect(site.lists.CORMS_Correspondence.items[0].Status).toBe('Declared');
  });
});

describe('logView', () => {
  it('writes an arbitrary event through the audit service', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    await core.logView('1', 'Viewed Timeline', 'Viewed Timeline for X');

    expect(auditTrailService.entries).toHaveLength(1);
    expect(auditTrailService.entries[0].action).toBe('Viewed Timeline');
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });
});

describe('CMS-024 — annotation persistence (CORMS is the source of truth, not GroupDocs)', () => {
  it('getAnnotations returns [] when the column has never been set, and audits the view', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = makeCore(site, 5, auditTrailService);

    expect(await core.getAnnotations('1')).toEqual([]);
    expect(auditTrailService.entries[0].action).toBe('Viewed Annotations');
  });

  it('saveAnnotations persists the set as a JSON envelope on the item, round-tripping through getAnnotations', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const core = makeCore(site);

    await core.saveAnnotations('1', [
      { type: 'Area', pageNumber: 0, text: 'Check', box: { x: 1, y: 2, width: 3, height: 4 } },
    ]);

    const stored = site.lists.CORMS_Correspondence.items[0].AnnotationsJson as string;
    expect(JSON.parse(stored).annotations).toHaveLength(1);

    const readBack = await core.getAnnotations('1');
    expect(isAccessDenied(readBack)).toBe(false);
    if (isAccessDenied(readBack)) throw new Error('expected ok');
    expect(readBack).toHaveLength(1);
    expect(readBack[0].text).toBe('Check');
    expect(readBack[0].box).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('saveAnnotations([]) clears the persisted set (round-trips back to no annotations)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedEmptySupportLists(site);
    const core = makeCore(site);

    await core.saveAnnotations('1', [{ type: 'Point', box: { x: 0, y: 0, width: 1, height: 1 } }]);
    await core.saveAnnotations('1', []);

    expect(await core.getAnnotations('1')).toEqual([]);
  });

  it('both methods deny below-clearance callers with the access-denied shape and write nothing', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site, { SecurityLevel: 'Top Secret' });
    seedEmptySupportLists(site);
    const core = makeCore(site, 1);

    expect(await core.getAnnotations('1')).toEqual({ accessDenied: true });
    expect(await core.saveAnnotations('1', [{ type: 'Area' }])).toEqual({ accessDenied: true });
    expect(site.lists.CORMS_Correspondence.items[0].AnnotationsJson).toBeUndefined();
  });
});

describe('saveSignedMainDocument — every signature lands on one main document', () => {
  const FOLDER = '/sites/CORMS/CORMS_Attachments/2026/01/1';

  function setUp(mainFileName: string): {
    core: CorrespondenceDetailServiceCore;
    site: ReturnType<typeof createFakeSite>;
    replaced: string[];
    uploaded: string[];
  } {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondenceItem(site);
    seedList(site, 'CORMS_Timeline', []);
    seedList(site, 'CORMS_PhysicalAttachments', []);
    seedList(site, 'CORMS_Attachments', [
      { Id: 1, CorrespondenceId: '1', FileName: mainFileName, IsMainLetter: true, Source: 'Uploaded' },
    ]);
    const replaced: string[] = [];
    const uploaded: string[] = [];
    const storage = new AttachmentStorageServiceCore({
      ensureFolder: async () => undefined,
      uploadFile: async (folderPath: string, fileName: string) => {
        uploaded.push(`${folderPath}/${fileName}`);
        return { fileName, serverRelativeUrl: `${FOLDER}/${fileName}` };
      },
      replaceFile: async (serverRelativeUrl: string) => {
        replaced.push(serverRelativeUrl);
      },
      listFiles: async () => [{ fileName: mainFileName, serverRelativeUrl: `${FOLDER}/${mainFileName}` }],
    });
    const contentSurface = {
      // Uploading a file into the library creates its list item.
      resolveItemId: async () => {
        site.lists.CORMS_Attachments.items.push({ Id: 2, CorrespondenceId: '' });
        return 2;
      },
      uploadPlaceholder: async () => 0,
    };
    const core = new CorrespondenceDetailServiceCore(
      createFakeSp(site),
      async () => 5,
      new InMemoryAuditTrailService(),
      undefined,
      storage,
      contentSurface
    );
    return { core, site, replaced, uploaded };
  }

  it('replaces a main PDF in place, so SharePoint keeps each signed version', async () => {
    const { core, replaced, uploaded } = setUp('Letter.pdf');

    const result = await core.saveSignedMainDocument('1', new Blob(['%PDF']));

    expect(result).toBe('Letter.pdf');
    expect(replaced).toEqual([`${FOLDER}/Letter.pdf`]);
    expect(uploaded).toEqual([]);
  });

  it('adds a signed PDF beside a Word main document and makes it the main document', async () => {
    const { core, site, replaced, uploaded } = setUp('Letter.docx');

    const result = await core.saveSignedMainDocument('1', new Blob(['%PDF']));

    expect(result).toBe('Letter.pdf');
    expect(replaced).toEqual([]);
    expect(uploaded).toEqual(['2026/01/1/Letter.pdf']);
    const rows = site.lists.CORMS_Attachments.items;
    expect(rows.find((row) => row.Id === 1)?.IsMainLetter).toBe(false);
    expect(rows.find((row) => row.Id === 2)).toEqual(
      expect.objectContaining({ FileName: 'Letter.pdf', IsMainLetter: true, CorrespondenceId: '1' })
    );
  });
});
