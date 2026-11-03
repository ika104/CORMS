/** Result of any bulk action — `rejected` carries ids the server dropped from the batch (out of
 * clearance, or otherwise not actioned) so the caller can tell the user some items were skipped,
 * rather than silently reporting full success (CMS-057 AC8). */
export interface IBulkActionResult {
  succeeded: string[];
  rejected: string[];
}

/** Thrown when the signed-in user's CORMS role is not permitted to perform the action at all
 * (e.g. Expedite — CMS-057 AC4 role gate) — distinct from a per-item clearance rejection, which
 * silently drops just that id from the batch instead of failing the whole call. */
export class BulkActionForbiddenError extends Error {
  constructor(action: string) {
    super(`Forbidden: current role is not permitted to ${action}`);
    // TS compiles to ES5 for this project (SPFx) — extending a built-in like Error breaks the
    // prototype chain there unless it's explicitly restored, which would otherwise make
    // `instanceof BulkActionForbiddenError` false for a caller catching this. See
    // https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, BulkActionForbiddenError.prototype);
    this.name = 'BulkActionForbiddenError';
  }
}

/** CMS-057 bulk actions over CORMS_Correspondence / CORMS_ReadReceipts / CORMS_CustomFolders.
 * Always live, no ds.* toggle. Every method re-validates clearance server-side per targeted id
 * (AC8) — a manipulated client request naming an out-of-clearance id is dropped from the batch,
 * not trusted. Reads/writes are PnPjs-batched so N selected items are one HTTP round-trip. */
export interface IBulkActionsService {
  markRead(correspondenceIds: string[]): Promise<IBulkActionResult>;
  markUnread(correspondenceIds: string[]): Promise<IBulkActionResult>;
  /** Throws BulkActionForbiddenError when the current role is none of DocumentControl /
   * SupervisorManager / SystemAdministrator (AC4) — checked once for the whole call, before any
   * per-item clearance check runs. */
  expedite(correspondenceIds: string[], reason: string): Promise<IBulkActionResult>;
  /** CMS-015 AC6 — clears the expedite flag on each item (persisted server-side): resets
   * ExpeditedFlag/Reason/By/At and writes an 'ExpediteRemoved' Timeline event. Same role gate as
   * expedite (throws BulkActionForbiddenError for a non-authorized role, AC1) and the same per-item
   * clearance partition. Priority is left as-is — the pre-expedite value isn't retained, so removal
   * lifts the flag without silently re-deriving a priority the item may no longer warrant. */
  removeExpedite(correspondenceIds: string[]): Promise<IBulkActionResult>;
  /** Real SharePoint list-item delete (lands in the site Recycle Bin, not purged — an acceptable
   * safety net, not something to bypass). Callers are expected to only offer this from a Drafts
   * context; the service itself does not re-check Status = Draft (AC — "reachable from Drafts
   * context" is a UI-affordance requirement, not a server-side status gate the task specifies). */
  deleteDrafts(correspondenceIds: string[]): Promise<IBulkActionResult>;
  /** Pins each id into the given folder, once per item, via the same ETag-conditional-update
   * pin logic as CustomFolderService (Part 5) — never a second implementation. */
  addToFolder(folderId: string, correspondenceIds: string[]): Promise<IBulkActionResult>;
}
