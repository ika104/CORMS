import type { SPFI } from '@pnp/sp';
import { idInClause } from '../common/odata';
import { getCurrentSiteUserId } from '../common/currentUserId';

const LIST_TITLE = 'CORMS_ReadReceipts';

/**
 * Pure CORMS_ReadReceipts read/write logic — see provisioningCore.ts's file comment for why Core
 * classes only ever `import type { SPFI }`. ReadReceiptService.live.ts is the thin real wrapper.
 *
 * Batched via sp.batched() for both markRead and markUnread (CMS-057 AC — "N selected items are
 * one HTTP round-trip, not N"), used by both the Unread quick filter's own mark-as-read-on-open
 * flow and BulkActionsService's Mark Read/Unread bulk action, so there is exactly one
 * implementation of the batching behavior.
 */
export class ReadReceiptServiceCore {
  constructor(private readonly sp: SPFI) {}

  public async getUnreadIds(correspondenceIds: string[]): Promise<Set<string>> {
    if (correspondenceIds.length === 0) return new Set();
    const readIds = await this.getReadCorrespondenceIds(correspondenceIds);
    return new Set(correspondenceIds.filter((id) => !readIds.has(id)));
  }

  public async markRead(correspondenceIds: string[]): Promise<void> {
    if (correspondenceIds.length === 0) return;
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const alreadyRead = await this.getReadCorrespondenceIds(correspondenceIds);
    const toInsert = correspondenceIds.filter((id) => !alreadyRead.has(id));
    if (toInsert.length === 0) return;

    const [batchedSp, execute] = this.sp.batched();
    const nowIso = new Date().toISOString();
    toInsert.forEach((id) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
      batchedSp.web.lists.getByTitle(LIST_TITLE).items.add({ CorrespondenceId: id, UserId: currentUserId, ReadAt: nowIso });
    });
    await execute();
  }

  public async markUnread(correspondenceIds: string[]): Promise<void> {
    if (correspondenceIds.length === 0) return;
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const rowIds = await this.getReceiptRowIds(correspondenceIds, currentUserId);
    if (rowIds.length === 0) return;

    const [batchedSp, execute] = this.sp.batched();
    rowIds.forEach((rowId) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- batched calls resolve on execute()
      batchedSp.web.lists.getByTitle(LIST_TITLE).items.getById(rowId).delete();
    });
    await execute();
  }

  private async getReadCorrespondenceIds(correspondenceIds: string[]): Promise<Set<string>> {
    if (correspondenceIds.length === 0) return new Set();
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const items = await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`UserId eq ${currentUserId} and (${idInClause('CorrespondenceId', correspondenceIds)})`)
      .select('CorrespondenceId')();
    return new Set((items as Array<{ CorrespondenceId: string }>).map((i) => i.CorrespondenceId));
  }

  private async getReceiptRowIds(correspondenceIds: string[], currentUserId: number): Promise<number[]> {
    const items = await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`UserId eq ${currentUserId} and (${idInClause('CorrespondenceId', correspondenceIds)})`)
      .select('Id')();
    return (items as Array<{ Id: number }>).map((i) => i.Id);
  }
}
