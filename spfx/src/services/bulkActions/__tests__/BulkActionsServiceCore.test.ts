import { BulkActionsServiceCore } from '../BulkActionsServiceCore';
import { BulkActionForbiddenError } from '../../interfaces/IBulkActionsService';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;

function seedCorrespondence(site: ReturnType<typeof createFakeSite>): void {
  seedList(site, 'CORMS_Correspondence', [
    { Id: 1, Title: 'A', SecurityLevel: 'Public/Unclassified', Status: 'Draft' },
    { Id: 2, Title: 'B', SecurityLevel: 'Top Secret', Status: 'Draft' },
    { Id: 3, Title: 'C', SecurityLevel: 'Public/Unclassified', Status: 'Registered' },
  ]);
}

function makeCore(site: ReturnType<typeof createFakeSite>, role: string, clearanceTier = 1): { core: BulkActionsServiceCore } {
  seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: site.currentUserId, Role: role }]);
  const core = new BulkActionsServiceCore(createFakeSp(site), async () => clearanceTier);
  return { core };
}

describe('CMS-057', () => {
  it('markRead: bulk mark-read via one batched call, not N calls', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_ReadReceipts', []);
    const { core } = makeCore(site, 'Recipient', 5);

    const result = await core.markRead(['1', '3']);

    expect(result.succeeded.sort()).toEqual(['1', '3']);
    expect(site.requestLog.filter((op) => op === 'batch-execute')).toHaveLength(1);
  });

  it('AC4: markUnread removes the read receipts for the selected items, in one batched call', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_ReadReceipts', [
      { Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' },
      { Id: 2, CorrespondenceId: '3', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' },
    ]);
    const { core } = makeCore(site, 'Recipient', 5);

    const result = await core.markUnread(['1', '3']);

    expect(result.succeeded.sort()).toEqual(['1', '3']);
    expect(site.lists.CORMS_ReadReceipts.items).toHaveLength(0);
    expect(site.requestLog.filter((op) => op === 'batch-execute')).toHaveLength(1);
  });

  it('AC8: markUnread applies the same clearance trimming as every other bulk action', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_ReadReceipts', [
      { Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' },
      { Id: 2, CorrespondenceId: '2', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' },
    ]);
    const { core } = makeCore(site, 'Recipient', 1);

    // id 2 is Top Secret, above this user's clearance — its receipt must survive untouched.
    const result = await core.markUnread(['1', '2']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['2']);
    expect(site.lists.CORMS_ReadReceipts.items.map((r) => r.CorrespondenceId)).toEqual(['2']);
  });

  it('AC4: expedite is rejected server-side for a disallowed role, even if attempted', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    const { core } = makeCore(site, 'Recipient', 5);

    await expect(core.expedite(['1'], 'urgent')).rejects.toBeInstanceOf(BulkActionForbiddenError);
    // Nothing should have been written — the role check happens before any mutation.
    expect(site.lists.CORMS_Correspondence.items[0].ExpeditedFlag).toBeUndefined();
  });

  it('AC4: expedite succeeds for an allowed role and batches the write', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    const { core } = makeCore(site, 'DocumentControl', 5);

    const result = await core.expedite(['1', '3'], 'urgent deadline');

    expect(result.succeeded.sort()).toEqual(['1', '3']);
    // Two batched round trips: the CORMS_Correspondence update, and the CMS-040 Part 6
    // CORMS_Timeline backfill write — still one batch-execute each, not one call per id.
    expect(site.requestLog.filter((op) => op === 'batch-execute')).toHaveLength(2);
    const row = site.lists.CORMS_Correspondence.items.find((r) => r.Id === 1);
    expect(row?.ExpeditedFlag).toBe(true);
    expect(row?.ExpeditedReason).toBe('urgent deadline');
  });

  it('CMS-040 Part 6: expedite writes an Expedited CORMS_Timeline row per succeeded id, not for rejected ones', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_Timeline', []);
    // Tier 1 clearance: item 2 (Top Secret) is out of clearance and gets rejected; item 1 (Public)
    // succeeds — proves the Timeline write only happens for ids that actually succeeded.
    const { core } = makeCore(site, 'DocumentControl', 1);

    await core.expedite(['1', '2'], 'urgent deadline');

    const timelineRows = site.lists.CORMS_Timeline.items;
    expect(timelineRows.map((r) => r.CorrespondenceId).sort()).toEqual(['1']);
    expect(timelineRows[0].EventType).toBe('Expedited');
    expect(timelineRows[0].Description).toContain('urgent deadline');
  });

  it('CMS-015 AC6/AC1: removeExpedite is rejected server-side for a disallowed role, with no mutation', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      { Id: 1, Title: 'A', SecurityLevel: 'Public/Unclassified', Status: 'Registered', ExpeditedFlag: true, ExpeditedReason: 'urgent' },
    ]);
    const { core } = makeCore(site, 'Recipient', 5);

    await expect(core.removeExpedite(['1'])).rejects.toBeInstanceOf(BulkActionForbiddenError);
    expect(site.lists.CORMS_Correspondence.items[0].ExpeditedFlag).toBe(true);
  });

  it('CMS-015 AC6: removeExpedite clears the flag columns and writes an ExpediteRemoved Timeline row', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      { Id: 1, Title: 'A', SecurityLevel: 'Public/Unclassified', Status: 'Registered', ExpeditedFlag: true, ExpeditedReason: 'urgent', ExpeditedAt: '2026-01-01T00:00:00Z' },
    ]);
    seedList(site, 'CORMS_Timeline', []);
    const { core } = makeCore(site, 'DocumentControl', 5);

    const result = await core.removeExpedite(['1']);

    expect(result.succeeded).toEqual(['1']);
    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.ExpeditedFlag).toBe(false);
    expect(row.ExpeditedReason).toBe('');
    expect(row.ExpeditedAt).toBeNull();
    const timelineRows = site.lists.CORMS_Timeline.items;
    expect(timelineRows[0].EventType).toBe('ExpediteRemoved');
  });

  it('CMS-015 AC6: removeExpedite applies the same clearance partition (drops an out-of-clearance id)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      { Id: 1, Title: 'A', SecurityLevel: 'Public/Unclassified', Status: 'Registered', ExpeditedFlag: true },
      { Id: 2, Title: 'B', SecurityLevel: 'Top Secret', Status: 'Registered', ExpeditedFlag: true },
    ]);
    seedList(site, 'CORMS_Timeline', []);
    const { core } = makeCore(site, 'DocumentControl', 1);

    const result = await core.removeExpedite(['1', '2']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['2']);
    // id 2 is above clearance — its flag is untouched.
    expect(site.lists.CORMS_Correspondence.items.find((r) => r.Id === 2)?.ExpeditedFlag).toBe(true);
  });

  it('AC8: bulk clearance enforcement drops an out-of-clearance id from a manipulated batch', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_ReadReceipts', []);
    const { core } = makeCore(site, 'Recipient', 1);

    // id 2 is Top Secret — above the current user's clearance tier (1) — even though the client
    // included it in the request.
    const result = await core.markRead(['1', '2']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['2']);
  });

  it('AC8: an id that does not resolve to a real row is also dropped, never trusted', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_ReadReceipts', []);
    const { core } = makeCore(site, 'Recipient', 5);

    const result = await core.markRead(['1', '999']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['999']);
  });

  it('deleteDrafts: only reachable from Drafts — a non-Draft id is rejected server-side, not just hidden by the UI', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    const { core } = makeCore(site, 'Recipient', 5);

    // id 3 is Status='Registered', not a draft — even though the client included it.
    const result = await core.deleteDrafts(['1', '3']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['3']);
    expect(site.lists.CORMS_Correspondence.items.map((r) => r.Id)).toEqual([2, 3]);
  });

  it('deleteDrafts: real delete, only the allowed (in-clearance) ids are removed', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    const { core } = makeCore(site, 'Recipient', 1);

    const result = await core.deleteDrafts(['1', '2']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['2']);
    expect(site.lists.CORMS_Correspondence.items.map((r) => r.Id)).toEqual([2, 3]);
  });

  it('addToFolder: pins only allowed ids into the folder via CustomFolderService pin logic', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCorrespondence(site);
    seedList(site, 'CORMS_CustomFolders', [{ Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: '[]', OwnerUserId: CURRENT_USER_ID }]);
    const { core } = makeCore(site, 'Recipient', 1);

    const result = await core.addToFolder('1', ['1', '2']);

    expect(result.succeeded).toEqual(['1']);
    expect(result.rejected).toEqual(['2']);
    expect(JSON.parse(site.lists.CORMS_CustomFolders.items[0].PinnedItemIds as string)).toEqual(['1']);
  });
});
