import { IReadReceiptService } from '../interfaces/IReadReceiptService';

/** In-memory stand-in for testHarness.tsx / component tests — CORMS_ReadReceipts has no
 * mock/live toggle in production (always ReadReceiptServiceLive via bootstrap.ts). */
export class ReadReceiptServiceMock implements IReadReceiptService {
  private readonly readIds = new Set<string>();

  public getUnreadIds(correspondenceIds: string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(correspondenceIds.filter((id) => !this.readIds.has(id))));
  }

  public markRead(correspondenceIds: string[]): Promise<void> {
    correspondenceIds.forEach((id) => this.readIds.add(id));
    return Promise.resolve();
  }

  public markUnread(correspondenceIds: string[]): Promise<void> {
    correspondenceIds.forEach((id) => this.readIds.delete(id));
    return Promise.resolve();
  }
}
