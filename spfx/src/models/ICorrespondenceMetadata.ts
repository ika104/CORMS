export interface IContentType {
  id: string;
  name: string;
}

/** A Correspondence Type option (Admin Config JSON). `id` is the value logic relies on
 * ('Outgoing' / 'Incoming' — numbering direction, validation); nameEn/nameAr are display labels. */
export interface ICorrespondenceTypeOption {
  id: string;
  nameEn: string;
  nameAr: string;
}

/** A Channel option (Admin Config JSON, admin.channelsJson) — how a correspondence was received
 * (Email / Scan / Fax by default). `id` is the stable value persisted on the correspondence
 * (CORMS_Correspondence.Channel); nameEn/nameAr are the bilingual display labels. Editable anytime
 * from Admin Config with no code change. */
export interface IChannelOption {
  id: string;
  nameEn: string;
  nameAr: string;
}

export interface IOriginatingFunction {
  id: string;
  /** English label. */
  name: string;
  /** Arabic label, when the Admin Config JSON entry provides one. */
  nameAr?: string;
}

export interface IRecipient {
  id: string;
  name: string;
  department?: string;
  /** CMS-006 AC5 — the person's max security clearance on the ascending tier scale
   * (1 = Unclassified .. 5 = Top Secret, see SECURITY_TIERS). Only users whose clearance is >= the
   * correspondence's security level may be added to an approval step. Undefined when the directory
   * doesn't expose a clearance yet (live) — treated as unknown, not as "no clearance". */
  clearanceTier?: number;
}

/** A person resolved from the SharePoint/AAD people picker (Recipient field). `id` is the login
 * name / claims key (stable, unique); email is included when the directory provides one. */
export interface IPersonOption {
  id: string;
  name: string;
  email?: string;
}

export interface IRecordClassification {
  id: string;
  recordNumber: string;
  name: string;
  /** Arabic display name (RH_ArabicName on RH_Aggregations). Used to build the Arabic DDL label
   * "RH_Number - RH_ArabicName"; falls back to `name` when absent. */
  nameAr?: string;
  active: boolean;
  /** CMS-034 AC2 — the minimum security clearance (ascending tier, 1=Unclassified..5=Top Secret,
   * see SECURITY_TIERS) a user must hold to be offered this classification. Optional: RecordsHub
   * may not carry such a column, so it's sourced where available and left undefined otherwise —
   * an unknown level is treated as selectable (mirrors approvalChain's isEligibleForStep) so live
   * picking is never falsely blocked. */
  clearanceTier?: number;
}

export interface IDestinationDepartment {
  id: string;
  /** English department name (RH_OrgSecurity RH_DepartmentName). */
  name: string;
  /** Arabic department name (RH_OrgSecurity RH_DepartmentNameAR), when present. */
  nameAr?: string;
}

export interface IExternalOrganization {
  id: string;
  /** Primary display name (English by convention). */
  name: string;
  /** Arabic display name, when the Admin Config JSON entry provides one. */
  nameAr?: string;
  /** Contact email address for the organization, when configured. */
  email?: string;
}

/** A selectable security classification level, sourced from the RecordsHub RH_SecurityLevels list
 * (configurable URL) rather than a hard-coded scale. `tier` is the ascending numeric rank
 * (1 = lowest) used for clearance gating. */
export interface ISecurityLevel {
  id: string;
  name: string;
  tier: number;
}

/** A RecordHub-held document attachable by reference (Supporting Documents > Attach from RecordHub). */
export interface IRecordHubDocument {
  id: string;
  recordNumber: string;
  name: string;
}

export interface ICorrespondenceTemplate {
  id: string;
  name: string;
  /** Header/footer letterhead regions. Like the body, they carry wildcard placeholders the system
   * interpolates from the correspondence data (CMS-005 AC14). */
  header: string;
  footer: string;
  /** Contains wildcard placeholders — TODO(confirm) exact token syntax (TASK-05 §8 item 1); this repo uses {{sender}}, {{recipient}}, {{referenceNumber}}, {{date}}, {{subject}}, {{role}}. */
  bodyHtml: string;
  /** CMS-005 AC5 — templates are authored/approved by SSL Oman (edited from Administration, AC13).
   * Only approved templates are offered to originators when authoring an outgoing item; an
   * unapproved (draft) template is hidden from the Compose picker. Absent is treated as approved so
   * pre-existing rows without the column keep working. */
  approved?: boolean;
  /** CMS-037 AC4 — the template's version, bumped each time an admin saves it (saveTemplate).
   * The version in force when an outgoing item is authored is stamped onto the correspondence at
   * creation time, so a declared/delivered record carries the exact template revision it was built
   * from. Absent is treated as version 1 for pre-existing rows without the column. */
  version?: number;
}

export interface INumberingRequest {
  direction: 'Incoming' | 'Outgoing';
  originatingFunction?: string;
  contentType?: string;
  /** When set, reuses the thread's existing number instead of issuing a new one (spec §5: "one number is held constant across a thread"). */
  threadReferenceNumber?: string;
}

export interface INumberingResult {
  referenceNumber: string;
}
