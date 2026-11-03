import type { SPFI } from '@pnp/sp';
import { IFolderCriteria, IUserFolder } from '../../models/IFolder';
import { getCurrentSiteUserId } from '../common/currentUserId';

const LIST_TITLE = 'CORMS_CustomFolders';
const MAX_PIN_RETRY_ATTEMPTS = 5;

interface IFolderListItem {
  Id: number;
  FolderName?: string;
  CriteriaJSON?: string;
  PinnedItemIds?: string;
  'odata.etag'?: string;
}

function parseCriteria(raw: string | undefined): IFolderCriteria {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as IFolderCriteria;
  } catch {
    return {};
  }
}

function parsePinnedIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function mapRow(item: IFolderListItem): IUserFolder {
  return {
    id: String(item.Id),
    name: item.FolderName ?? '',
    criteria: parseCriteria(item.CriteriaJSON),
    manualIds: parsePinnedIds(item.PinnedItemIds),
  };
}

function isETagConflict(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status === 409 || status === 412;
}

/**
 * Pure CORMS_CustomFolders CRUD + pin/unpin logic (CMS-054 Part 5) — see provisioningCore.ts's
 * file comment for why Core classes only `import type { SPFI }`. CustomFolderService.live.ts is
 * the thin real wrapper, implementing the pre-existing IFolderService interface unchanged.
 *
 * Pin/unpin concurrency: PinnedItemIds is a read-modify-write JSON array on a single list item —
 * two users (or two rapid clicks) pinning at once can race and silently drop one write with a
 * naive read-then-write. Uses PnPjs's ETag-based conditional update (item.update(data, etag)) —
 * SharePoint responds 412 Precondition Failed when the ETag no longer matches — with a bounded
 * retry loop (re-read, re-apply the same mutation to the fresh value, re-submit) rather than
 * failing the whole action on the first conflict. This is a real correctness fix, not a
 * nice-to-have: without it, one of two concurrent pins is silently lost.
 */
export class CustomFolderServiceCore {
  constructor(private readonly sp: SPFI) {}

  public async getFolders(): Promise<IUserFolder[]> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`OwnerUserId eq ${currentUserId}`)
      .select('Id', 'FolderName', 'CriteriaJSON', 'PinnedItemIds')()) as IFolderListItem[];
    return items.map(mapRow);
  }

  public async createFolder(input: { name: string; criteria: IFolderCriteria }): Promise<IUserFolder> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const result = await this.sp.web.lists.getByTitle(LIST_TITLE).items.add({
      Title: input.name,
      FolderName: input.name,
      CriteriaJSON: JSON.stringify(input.criteria),
      PinnedItemIds: JSON.stringify([]),
      OwnerUserId: currentUserId,
    });
    const created = (result as { data?: IFolderListItem }).data ?? (result as IFolderListItem);
    return mapRow({ ...created, FolderName: input.name, CriteriaJSON: JSON.stringify(input.criteria), PinnedItemIds: JSON.stringify([]) });
  }

  public async deleteFolder(id: string): Promise<void> {
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(Number(id)).delete();
  }

  public pinItems(folderId: string, ids: string[]): Promise<IUserFolder> {
    return this.updatePinnedWithRetry(folderId, (current) => Array.from(new Set([...current, ...ids])));
  }

  public unpinItem(folderId: string, id: string): Promise<IUserFolder> {
    return this.updatePinnedWithRetry(folderId, (current) => current.filter((x) => x !== id));
  }

  private async updatePinnedWithRetry(
    folderId: string,
    mutate: (current: string[]) => string[],
    attempt = 0
  ): Promise<IUserFolder> {
    const idNum = Number(folderId);
    const itemRef = this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(idNum);
    const current = (await itemRef.select('Id', 'FolderName', 'CriteriaJSON', 'PinnedItemIds')()) as IFolderListItem;
    const nextPinned = mutate(parsePinnedIds(current.PinnedItemIds));

    try {
      await itemRef.update({ PinnedItemIds: JSON.stringify(nextPinned) }, current['odata.etag']);
    } catch (err) {
      if (isETagConflict(err) && attempt < MAX_PIN_RETRY_ATTEMPTS - 1) {
        return this.updatePinnedWithRetry(folderId, mutate, attempt + 1);
      }
      throw err;
    }

    return mapRow({ ...current, PinnedItemIds: JSON.stringify(nextPinned) });
  }
}
