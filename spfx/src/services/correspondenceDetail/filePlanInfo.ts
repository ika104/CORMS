import { IFilePlanInfo } from '../../models/ICorrespondenceDetail';

/**
 * CMS-027 AC3 — derives the enclosing business-activity File and its file-plan position from the
 * correspondence's Record Classification. RecordsHub stores the classification on the item as a
 * single string in the form "<code> - <title>" (e.g. "10773 - التنظيم العام للجهة"), where the code
 * is the file's position in the RecordsHub file plan and the title is the file's business-activity
 * name. Kept as a pure, unit-tested helper so the same derivation is used by the live detail
 * service and can be reasoned about without a RecordsHub round trip.
 *
 * Returns undefined when the item carries no classification, so the File Plan tab can show a clear
 * "not filed / unclassified" state rather than an empty shell.
 */
export function buildFilePlanInfo(recordClassification: string | undefined): IFilePlanInfo | undefined {
  const raw = (recordClassification ?? '').trim();
  if (!raw) return undefined;

  // Split on the first hyphen / en-dash / em-dash / plus separating the code from the title. The
  // code is the leading token; everything after the separator is the title. Both the Create
  // Correspondence picker ("<code> - <name>", hyphen) and the Triage/Classify picker
  // ("<code> — <name>", em-dash) write this label, so all three dash forms must be recognised or a
  // classified item's file number renders as the whole label. When there is no separator the whole
  // value is treated as the title and doubles as the position.
  const match = raw.match(/^\s*([^\s\-–—+][^\-–—+]*?)\s*[-–—+]\s*(.+)$/);
  const code = (match ? match[1] : raw).trim();
  const title = (match ? match[2] : raw).trim();

  return {
    // The classification code identifies the file and is also its coded position in the file plan.
    fileNumber: code,
    fileName: title,
    filePlanPosition: code,
  };
}
