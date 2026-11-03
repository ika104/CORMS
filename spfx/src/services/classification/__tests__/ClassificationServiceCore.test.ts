import { ClassificationServiceCore } from '../ClassificationServiceCore';
import { IAuditTrailService } from '../../interfaces/IAuditTrailService';
import { IGlobalAuditEntry } from '../../../models/IAuditTrail';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CORRESPONDENCE_ID = '100';
const ACTOR_ID = 42;

function makeFakeAuditTrailService(): IAuditTrailService & { logEvent: jest.Mock } {
  return {
    getEntries: jest.fn().mockResolvedValue([]),
    logEvent: jest.fn().mockImplementation((entry: Omit<IGlobalAuditEntry, 'id' | 'seq' | 'category' | 'chainStatus'>) =>
      Promise.resolve({ id: 'AUD-0001', seq: 1, category: 'correspondence', chainStatus: 'valid', ...entry })
    ),
    getReassignmentsInvolving: jest.fn().mockResolvedValue([]),
  };
}

function makeSiteWithItem(): ReturnType<typeof createFakeSite> {
  const site = createFakeSite(ACTOR_ID);
  seedList(site, 'CORMS_Correspondence', [
    { Id: Number(CORRESPONDENCE_ID), ContentTypeName: 'Letter', Priority: 'Normal', SecurityLevel: 'Confidential' },
  ]);
  seedList(site, 'CORMS_Timeline', []);
  return site;
}

describe('CMS-010 ClassificationServiceCore — persist + audit a triage classify/amend', () => {
  it('persists the changed metadata to CORMS_Correspondence and writes an audit entry + timeline row', async () => {
    const site = makeSiteWithItem();
    const audit = makeFakeAuditTrailService();
    const core = new ClassificationServiceCore(createFakeSp(site), audit);

    await core.applyClassification({
      correspondenceId: CORRESPONDENCE_ID,
      contentType: 'Memo',
      priority: 'High',
      securityTier: 5, // Top Secret
      recordClassification: '9974 - Finance',
      responseDeadline: '2026-10-01',
      action: 'Correspondence Classification Amended',
      auditDetails: JSON.stringify({ changes: [{ field: 'securityTier', from: 'Confidential', to: 'Top Secret' }], reason: 'reclassified' }),
      summary: 'securityTier: Confidential → Top Secret',
    });

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.ContentTypeName).toBe('Memo');
    expect(row.Priority).toBe('High');
    expect(row.SecurityLevel).toBe('Top Secret'); // tier 5 -> Choice string
    expect(row.RecordClassification).toBe('9974 - Finance');
    expect(row.DueDate).toBe('2026-10-01');

    expect(audit.logEvent).toHaveBeenCalledTimes(1);
    expect(audit.logEvent.mock.calls[0][0]).toMatchObject({
      objectId: CORRESPONDENCE_ID,
      action: 'Correspondence Classification Amended',
    });

    const timeline = site.lists.CORMS_Timeline.items;
    expect(timeline).toHaveLength(1);
    expect(timeline[0].EventType).toBe('Edited');
    expect(timeline[0].CorrespondenceId).toBe(CORRESPONDENCE_ID);
  });

  it('only writes the fields that were provided (an unset field never clears a captured value)', async () => {
    const site = makeSiteWithItem();
    const core = new ClassificationServiceCore(createFakeSp(site), makeFakeAuditTrailService());

    await core.applyClassification({
      correspondenceId: CORRESPONDENCE_ID,
      priority: 'High', // only priority changed; content type / security left unset
      action: 'Correspondence Classified',
      auditDetails: '{"changes":[{"field":"priority","from":"Normal","to":"High"}]}',
      summary: 'priority: Normal → High',
    });

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.Priority).toBe('High');
    expect(row.ContentTypeName).toBe('Letter'); // untouched
    expect(row.SecurityLevel).toBe('Confidential'); // untouched
  });
});
