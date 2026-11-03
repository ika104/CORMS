/** CMS-055 — backs the RecordsHub Configuration List (SLA thresholds, escalation cadences,
 * deadlines, Power Automate/Power App workflow URLs, connection settings, ...). */
export interface IAdminConfigEntry {
  key: string;
  value: string;
  description: string;
  /** CORMS_AdminConfig.Category (General/Integration; DataSource rows are excluded from this
   * screen — see AdminConfigService.live.ts). Surfaced so the Admin Config screen can show which
   * bucket a row belongs to and, with the key, derive its RecordsHub-vs-CORMS owner (CMS-055 AC5 /
   * CMS-036 AC3 — see configOwnership.ts). Undefined on rows read before this column existed. */
  category?: 'General' | 'Integration';
}

/** CMS-055 AC1 — the fields an admin supplies when ADDING a new configuration value (existing
 * rows are edited in place via saveEntry). Category defaults to 'General' when omitted. */
export interface IAddAdminConfigInput {
  key: string;
  value: string;
  description: string;
  category?: 'General' | 'Integration';
}
