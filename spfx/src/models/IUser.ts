export interface IUser {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  /** Translation key for the job title, used by the mock user (a fixed role label). */
  jobTitleKey?: string;
  /** Free-text job title/position as returned by the live SharePoint user profile — no
   * translation key exists for arbitrary profile text, so it's rendered as-is. Takes
   * precedence over jobTitleKey when both are present. */
  jobTitle?: string;
  /** URL of the user's profile photo (e.g. SharePoint's userphoto.aspx). Falls back to
   * initials in the UI when absent or when the image fails to load. */
  photoUrl?: string;
  /** Max security tier (1=Public/Unclassified .. 5=Top Secret, ascending — see SECURITY_TIERS). TODO(confirm): sourced from ds.securityTiers once RecordsHub clearance API exists. */
  clearanceTier?: number;
  /** CMS-033 — used to scope Department Statistics to a Supervisor/Manager's own department.
   * TODO(confirm): not part of the RecordsHub identity model yet. */
  department?: string;
}
