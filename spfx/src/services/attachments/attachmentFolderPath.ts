/**
 * CMS AC11 — the CORMS_Attachments folder layout is Year / Month / Serial, derived from the
 * correspondence's creation date and its issued reference number. This is the single source of
 * truth used by BOTH the write side (persistPendingAttachments) and the read side
 * (CorrespondenceDetailServiceCore.getAttachments), so a file is always looked up under exactly the
 * folder it was written to — computing the path in two places independently is how attachments
 * silently stop resolving.
 *
 * A draft that hasn't been registered yet has no reference number, so it has no serial to fold
 * under: those files stay under the bare correspondence id until the item is numbered. Because a
 * draft-then-send item therefore has files split across `{id}` (draft-era) and `{Year}/{Month}/
 * {serial}` (post-registration), the read side lists BOTH candidates and merges — see
 * attachmentFolderReadCandidates.
 */

export interface IAttachmentFolderContext {
  /** The correspondence's SharePoint item id — the fallback leaf (and draft-era folder). */
  correspondenceId: string;
  /** CORMS_Correspondence.DateCreated (ISO). Supplies Year/Month. */
  dateCreated?: string;
  /** The issued reference number (e.g. OQ8-LEG-LTR-26-0012). Supplies the serial leaf. */
  referenceNumber?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The trailing numeric group of a reference number (e.g. "…-26-0012" -> "0012"), or undefined
 * when the reference carries no trailing digits. */
export function extractSerial(referenceNumber: string | undefined): string | undefined {
  if (!referenceNumber) return undefined;
  const match = /(\d+)\s*$/.exec(referenceNumber.trim());
  return match ? match[1] : undefined;
}

function yearMonth(dateCreated: string | undefined): { year: string; month: string } | undefined {
  if (!dateCreated) return undefined;
  const d = new Date(dateCreated);
  if (isNaN(d.getTime())) return undefined;
  return { year: String(d.getFullYear()), month: pad2(d.getMonth() + 1) };
}

/**
 * The folder a correspondence's files are WRITTEN to: `Year/Month/Serial` once the item has both a
 * creation date and a reference serial, else the bare correspondence id (draft / not-yet-numbered).
 */
export function buildAttachmentFolderPath(ctx: IAttachmentFolderContext): string {
  const ym = yearMonth(ctx.dateCreated);
  const serial = extractSerial(ctx.referenceNumber);
  if (ym && serial) return `${ym.year}/${ym.month}/${serial}`;
  return ctx.correspondenceId;
}

/**
 * Every folder a correspondence's files might live in, newest scheme first: the Year/Month/Serial
 * path (when numbered) and the bare id (draft-era, and the pre-AC11 legacy layout). Deduped, so an
 * unnumbered item yields just `[id]`.
 */
export function attachmentFolderReadCandidates(ctx: IAttachmentFolderContext): string[] {
  const primary = buildAttachmentFolderPath(ctx);
  const candidates = [primary, ctx.correspondenceId];
  return candidates.filter((value, index) => candidates.indexOf(value) === index);
}
