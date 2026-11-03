import { ReadReceiptServiceCore } from '../ReadReceiptServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;

describe('CMS-039 / CMS-057', () => {
  it('getUnreadIds: an item with no matching CORMS_ReadReceipts row is unread', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_ReadReceipts', [{ Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' }]);
    const core = new ReadReceiptServiceCore(createFakeSp(site));

    const unread = await core.getUnreadIds(['1', '2', '3']);

    expect(unread).toEqual(new Set(['2', '3']));
  });

  it('markRead: inserts one batched call, not N individual calls, for N ids', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_ReadReceipts', []);
    const core = new ReadReceiptServiceCore(createFakeSp(site));

    await core.markRead(['1', '2', '3']);

    expect(site.requestLog.filter((op) => op === 'batch-execute')).toHaveLength(1);
    expect(site.lists.CORMS_ReadReceipts.items).toHaveLength(3);
  });

  it('markRead: idempotent — an already-read id is not inserted a second time', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_ReadReceipts', [{ Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' }]);
    const core = new ReadReceiptServiceCore(createFakeSp(site));

    await core.markRead(['1', '2']);

    const rowsForId1 = site.lists.CORMS_ReadReceipts.items.filter((r) => r.CorrespondenceId === '1');
    expect(rowsForId1).toHaveLength(1);
    expect(site.lists.CORMS_ReadReceipts.items).toHaveLength(2);
  });

  it('markUnread: deletes the matching row via one batched call', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_ReadReceipts', [
      { Id: 1, CorrespondenceId: '1', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' },
      { Id: 2, CorrespondenceId: '2', UserId: CURRENT_USER_ID, ReadAt: '2026-01-01T00:00:00Z' },
    ]);
    const core = new ReadReceiptServiceCore(createFakeSp(site));

    await core.markUnread(['1', '2']);

    expect(site.requestLog.filter((op) => op === 'batch-execute')).toHaveLength(1);
    expect(site.lists.CORMS_ReadReceipts.items).toHaveLength(0);
  });

  it('markUnread: no-ops (no batch call) when nothing matches', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_ReadReceipts', []);
    const core = new ReadReceiptServiceCore(createFakeSp(site));

    await core.markUnread(['1']);

    expect(site.requestLog.filter((op) => op === 'batch-execute')).toHaveLength(0);
  });
});
