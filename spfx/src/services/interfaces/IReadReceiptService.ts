/** CORMS_ReadReceipts-backed read state (Part 0 schema, backs CMS-039's Unread quick filter and
 * CMS-057's bulk Mark Read/Unread). An item is unread for the current user when no matching
 * (CorrespondenceId, UserId) row exists — see listSchemas.ts's CORMS_READ_RECEIPTS_SCHEMA comment
 * for why this is a dedicated list rather than a field on CORMS_Correspondence. */
export interface IReadReceiptService {
  /** Among the given correspondence ids, the subset unread for the current user. */
  getUnreadIds(correspondenceIds: string[]): Promise<Set<string>>;
  /** Idempotent — a (CorrespondenceId, UserId) row already present is left as-is. */
  markRead(correspondenceIds: string[]): Promise<void>;
  /** Idempotent — deletes the matching row if present, no-ops otherwise. */
  markUnread(correspondenceIds: string[]): Promise<void>;
}
