import { CustomFolderServiceCore } from '../CustomFolderServiceCore';
import { CorrespondenceListServiceCore } from '../../correspondenceList/CorrespondenceListServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;

describe('CMS-054', () => {
  it('createFolder then listMine (getFolders) round-trips name and criteria for the current user', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', []);
    const core = new CustomFolderServiceCore(createFakeSp(site));

    const created = await core.createFolder({ name: 'Urgent Finance', criteria: { priority: 'High', sender: 'Finance' } });
    const folders = await core.getFolders();

    expect(created.name).toBe('Urgent Finance');
    expect(created.criteria).toEqual({ priority: 'High', sender: 'Finance' });
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe(created.id);
  });

  it('getFolders only returns folders owned by the current user', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', [
      { Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: '[]', OwnerUserId: CURRENT_USER_ID },
      { Id: 2, FolderName: 'Someone else\'s', CriteriaJSON: '{}', PinnedItemIds: '[]', OwnerUserId: 999 },
    ]);
    const core = new CustomFolderServiceCore(createFakeSp(site));

    const folders = await core.getFolders();

    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Mine');
  });

  it('deleteFolder removes the item', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', [{ Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: '[]', OwnerUserId: CURRENT_USER_ID }]);
    const core = new CustomFolderServiceCore(createFakeSp(site));

    await core.deleteFolder('1');

    expect(site.lists.CORMS_CustomFolders.items).toHaveLength(0);
  });

  it('pinItems unions new ids into the existing PinnedItemIds without removing prior pins', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', [{ Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: JSON.stringify(['a']), OwnerUserId: CURRENT_USER_ID }]);
    const core = new CustomFolderServiceCore(createFakeSp(site));

    const folder = await core.pinItems('1', ['b', 'c']);

    expect(folder.manualIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('unpinItem removes just the given id, leaving the rest pinned', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', [{ Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: JSON.stringify(['a', 'b']), OwnerUserId: CURRENT_USER_ID }]);
    const core = new CustomFolderServiceCore(createFakeSp(site));

    const folder = await core.unpinItem('1', 'a');

    expect(folder.manualIds).toEqual(['b']);
  });

  it('pin/unpin ETag-conflict retry: a stale ETag on the first attempt is retried and eventually succeeds', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', [{ Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: JSON.stringify(['a']), OwnerUserId: CURRENT_USER_ID }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp: any = createFakeSp(site);

    // Simulate a concurrent writer: the first update() attempt always 412s (as SharePoint does
    // on a genuine ETag mismatch), regardless of the ETag passed — the retry loop must catch
    // this, re-read the item, re-apply the same mutation to the fresh value, and resubmit rather
    // than failing the whole pin/unpin call on the first conflict.
    const originalGetByTitle = sp.web.lists.getByTitle;
    let updateAttempts = 0;
    sp.web.lists.getByTitle = (title: string) => {
      const collection = originalGetByTitle(title);
      if (title !== 'CORMS_CustomFolders') return collection;
      const originalGetById = collection.items.getById;
      collection.items.getById = (id: number) => {
        const ref = originalGetById(id);
        const originalUpdate = ref.update;
        ref.update = async (props: Record<string, unknown>, etag?: string): Promise<void> => {
          updateAttempts += 1;
          if (updateAttempts === 1) {
            throw Object.assign(new Error('Precondition Failed'), { status: 412 });
          }
          return originalUpdate(props, etag);
        };
        return ref;
      };
      return collection;
    };

    const core = new CustomFolderServiceCore(sp);
    const folder = await core.pinItems('1', ['b']);

    expect(folder.manualIds.sort()).toEqual(['a', 'b']);
    expect(updateAttempts).toBe(2);
    expect(site.lists.CORMS_CustomFolders.items[0].PinnedItemIds).toBe(JSON.stringify(['a', 'b']));
  });

  it('pinning an item into a folder never removes it from the base Inbox', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_CustomFolders', [{ Id: 1, FolderName: 'Mine', CriteriaJSON: '{}', PinnedItemIds: '[]', OwnerUserId: CURRENT_USER_ID }]);
    seedList(site, 'CORMS_Correspondence', [
      { Id: 100, Direction: 'Incoming', AssignedToId: CURRENT_USER_ID, SecurityLevel: 'Public/Unclassified', DateCreated: '2026-01-01T00:00:00Z', Status: 'Registered' },
    ]);
    seedList(site, 'CORMS_ReadReceipts', []);
    const sp = createFakeSp(site);
    const folderCore = new CustomFolderServiceCore(sp);
    const listCore = new CorrespondenceListServiceCore(sp, async () => 5);

    const folder = await folderCore.pinItems('1', ['100']);
    const inbox = await listCore.getInbox();

    expect(folder.manualIds).toEqual(['100']);
    expect(inbox.map((i) => i.id)).toEqual(['100']);
  });
});
