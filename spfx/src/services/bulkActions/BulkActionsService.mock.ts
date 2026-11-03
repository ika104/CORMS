import { IBulkActionResult, IBulkActionsService } from '../interfaces/IBulkActionsService';

/** Dev/jsdom-test stand-in — always succeeds, no clearance/role enforcement (mock users are
 * always Administrator / clearanceTier 5). BulkActionsService has no mock/live toggle in
 * production (always BulkActionsServiceLive via bootstrap.ts). */
export class BulkActionsServiceMock implements IBulkActionsService {
  public markRead(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return Promise.resolve({ succeeded: correspondenceIds, rejected: [] });
  }

  public markUnread(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return Promise.resolve({ succeeded: correspondenceIds, rejected: [] });
  }

  public expedite(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return Promise.resolve({ succeeded: correspondenceIds, rejected: [] });
  }

  public removeExpedite(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return Promise.resolve({ succeeded: correspondenceIds, rejected: [] });
  }

  public deleteDrafts(correspondenceIds: string[]): Promise<IBulkActionResult> {
    return Promise.resolve({ succeeded: correspondenceIds, rejected: [] });
  }

  public addToFolder(_folderId: string, correspondenceIds: string[]): Promise<IBulkActionResult> {
    return Promise.resolve({ succeeded: correspondenceIds, rejected: [] });
  }
}
