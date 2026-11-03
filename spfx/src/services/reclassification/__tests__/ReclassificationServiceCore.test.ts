import { ReclassificationServiceCore } from '../ReclassificationServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';
import { IReclassificationInput } from '../../../models/IReclassification';

function input(overrides: Partial<IReclassificationInput> = {}): IReclassificationInput {
  return {
    correspondenceId: '42',
    correspondenceRef: 'OQ8-FIN-LTR-26-0001',
    subject: 'Budget',
    fromTier: 5, // Top Secret
    toTier: 2, // Restricted (declassify)
    justification: 'No longer sensitive',
    actor: 'Zeyad',
    ...overrides,
  };
}

describe('CMS-023 — ReclassificationServiceCore', () => {
  it('AC1: applyDirect persists the new SecurityLevel on the correspondence (and nothing else)', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_Correspondence', [{ Id: 42, Title: 'Budget', SecurityLevel: 'Top Secret', RecordClassification: '9974 - Finance' }]);
    const core = new ReclassificationServiceCore(createFakeSp(site));

    await core.applyDirect(input());

    const row = site.lists.CORMS_Correspondence.items.find((r) => r.Id === 42);
    expect(row?.SecurityLevel).toBe('Restricted'); // tier 2
    // AC4 — the file-plan classification is untouched.
    expect(row?.RecordClassification).toBe('9974 - Finance');
  });

  it('AC2 (maker): requestReclassification adds a Pending request and does NOT change the level', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_Correspondence', [{ Id: 42, Title: 'Budget', SecurityLevel: 'Top Secret' }]);
    const core = new ReclassificationServiceCore(createFakeSp(site));

    await core.requestReclassification(input());

    const request = site.lists.CORMS_ReclassificationRequests.items[0];
    expect(request.Status).toBe('Pending');
    expect(request.CorrespondenceId).toBe('42');
    expect(request.FromLevel).toBe('Top Secret');
    expect(request.ToLevel).toBe('Restricted');
    expect(request.Justification).toBe('No longer sensitive');
    // Level unchanged until approved.
    expect(site.lists.CORMS_Correspondence.items.find((r) => r.Id === 42)?.SecurityLevel).toBe('Top Secret');
  });

  it('getPendingRequests returns only Pending, newest first', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_ReclassificationRequests', [
      { Id: 1, CorrespondenceId: '10', Status: 'Pending', ToTier: 3, RequestedAt: '2026-01-01T00:00:00Z' },
      { Id: 2, CorrespondenceId: '11', Status: 'Approved', ToTier: 2, RequestedAt: '2026-01-02T00:00:00Z' },
    ]);
    const core = new ReclassificationServiceCore(createFakeSp(site));

    const pending = await core.getPendingRequests();
    expect(pending.map((r) => r.id)).toEqual(['1']);
  });

  it('AC2 (checker) / AC5: approving applies the level change and marks the request Approved', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_Correspondence', [{ Id: 42, SecurityLevel: 'Top Secret' }]);
    seedList(site, 'CORMS_ReclassificationRequests', [{ Id: 5, CorrespondenceId: '42', ToTier: 2, FromLevel: 'Top Secret', ToLevel: 'Restricted', Status: 'Pending' }]);
    const core = new ReclassificationServiceCore(createFakeSp(site));

    await core.decideRequest({ requestId: '5', approve: true, decidedBy: 'Admin' });

    expect(site.lists.CORMS_ReclassificationRequests.items.find((r) => r.Id === 5)?.Status).toBe('Approved');
    expect(site.lists.CORMS_Correspondence.items.find((r) => r.Id === 42)?.SecurityLevel).toBe('Restricted');
  });

  it('rejecting marks the request Rejected and leaves the level unchanged', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_Correspondence', [{ Id: 42, SecurityLevel: 'Top Secret' }]);
    seedList(site, 'CORMS_ReclassificationRequests', [{ Id: 5, CorrespondenceId: '42', ToTier: 2, Status: 'Pending' }]);
    const core = new ReclassificationServiceCore(createFakeSp(site));

    await core.decideRequest({ requestId: '5', approve: false, decidedBy: 'Admin', decisionNote: 'Still sensitive' });

    expect(site.lists.CORMS_ReclassificationRequests.items.find((r) => r.Id === 5)?.Status).toBe('Rejected');
    expect(site.lists.CORMS_Correspondence.items.find((r) => r.Id === 42)?.SecurityLevel).toBe('Top Secret');
  });
});
