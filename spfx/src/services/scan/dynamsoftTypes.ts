/** One scanned page's metadata, as read from the Dynamsoft Document Scanner JS SDK's result. */
export interface IScanPage {
  /** Dots-per-inch resolution reported by the SDK for this page. */
  dpi: number;
  /** Output format the SDK produced this page in — configured to TIFF or PDF/A only (CMS-002 AC6). */
  format: string;
  /** 0..1 — fraction of the page area the SDK's content/ink detection considers "written on".
   * Whatever specific SDK signal this is sourced from, see scanQualityGate.ts's
   * checkCompleteness TODO(confirm) for the heuristic this feeds. */
  contentCoverage: number;
  /** The scanned image/PDF blob for this page, ready to upload. */
  blob: Blob;
}

export interface IScanResult {
  pages: IScanPage[];
  /** Convenience filename the SDK suggests (or the caller assigns) for the combined output. */
  fileName: string;
}

/** Persisted on the CORMS_Attachments row when a failed quality check is overridden (Part 0's
 * new fields: IsQualityOverridden/QualityOverrideReason/QualityOverriddenBy/QualityOverriddenAt). */
export interface IQualityOverride {
  reason: string;
  overriddenBy: string;
  overriddenAt: string;
}
