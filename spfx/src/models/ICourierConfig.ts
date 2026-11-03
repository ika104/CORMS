/**
 * Courier reference data for the Physical Mail (Courier / Express) dispatch step. Admin-managed as
 * JSON (CORMS_AdminConfig `admin.couriersJson`) so couriers can be shown/hidden and their
 * per-courier fields tuned without a code change. Each courier carries a description, an auto-
 * generated tracking-ref prefix, and its own set of extra fields (a select or free text).
 */
export interface ICourierFieldConfig {
  /** Stable key the captured value is stored under (physicalDispatch.courierFields[key]). */
  key: string;
  label: string;
  type: 'select' | 'text';
  required?: boolean;
  /** Options for a 'select' field. */
  options?: string[];
  /** Placeholder for a 'text' field. */
  placeholder?: string;
}

export interface ICourierConfig {
  id: string;
  name: string;
  description?: string;
  /** Prefix for the CORMS-generated tracking / dispatch reference (e.g. ASX → ASX-20260831-123456). */
  refPrefix?: string;
  /** false hides this courier from the picker; omitted/true shows it. */
  enabled?: boolean;
  fields?: ICourierFieldConfig[];
}

/** Built-in courier list — the source of truth when `admin.couriersJson` is unset, and the seed the
 * admin edits to add/hide couriers. Mirrors the reference app. */
export const DEFAULT_COURIERS: ICourierConfig[] = [
  {
    id: 'asyad',
    name: 'Asyad Express',
    description: 'National express logistics (Asyad Group)',
    refPrefix: 'ASX',
    enabled: true,
    fields: [
      { key: 'serviceLevel', label: 'Service Level', type: 'select', required: true, options: ['Same-Day', 'Next-Day', 'Standard'] },
      { key: 'originHub', label: 'Origin Hub', type: 'select', required: true, options: ['Muscat', 'Sohar', 'Nizwa', 'Salalah'] },
    ],
  },
  {
    id: 'omanpost',
    name: 'Oman Post (Barid)',
    description: 'National postal & courier operator',
    refPrefix: 'OMP',
    enabled: true,
    fields: [
      { key: 'serviceLevel', label: 'Service Level', type: 'select', required: true, options: ['Registered Mail', 'Barid Express', 'Standard'] },
      { key: 'deliveryOffice', label: 'Delivery Office', type: 'text', required: false, placeholder: 'e.g. Ruwi Post Office' },
    ],
  },
  {
    id: 'nool',
    name: 'Nool Oman',
    description: 'Last-mile same-day delivery',
    refPrefix: 'NOL',
    enabled: true,
    fields: [
      { key: 'deliveryWindow', label: 'Delivery Window', type: 'select', required: true, options: ['Morning (8–12)', 'Afternoon (12–4)', 'Evening (4–8)'] },
      { key: 'zone', label: 'Zone / Wilayat', type: 'text', required: true, placeholder: 'e.g. Al Khuwair' },
    ],
  },
  {
    id: 'almadina',
    name: 'Al Madina Logistics',
    description: 'Parcel & bulk document logistics',
    refPrefix: 'AML',
    enabled: true,
    fields: [
      { key: 'waybillType', label: 'Waybill Type', type: 'select', required: true, options: ['Document', 'Parcel', 'Bulk'] },
      { key: 'pickupContact', label: 'Pickup Contact', type: 'text', required: false, placeholder: 'Pickup point / contact person' },
    ],
  },
];

/** Generates a CORMS-side tracking/dispatch reference: `{PREFIX}-{YYYYMMDD}-{6 digits}` (not the
 * courier's own number). `now`/`rand` are injectable for testing. */
export function generateTrackingRef(prefix: string | undefined, now: Date = new Date(), rand: number = Math.random()): string {
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const serial = String(Math.floor(rand * 1_000_000)).padStart(6, '0');
  return `${(prefix || 'REF').toUpperCase()}-${yyyymmdd}-${serial}`;
}

/** Humanises a field key for display when no configured label is available (e.g. "originHub" →
 * "Origin Hub"). */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The display label for a captured courier field — the configured label when the courier is still
 * known, otherwise a humanised key so a value never renders label-less. */
export function courierFieldLabel(courier: ICourierConfig | undefined, key: string): string {
  const field = (courier?.fields ?? []).find((f) => f.key === key);
  return field?.label ?? humanizeKey(key);
}

/** Whether every required field of the chosen courier has a value — the Submit gate for the
 * Courier method (the base model check only knows a courier was picked). */
export function courierFieldsComplete(courier: ICourierConfig | undefined, values: Record<string, string> | undefined): boolean {
  if (!courier) return false;
  return (courier.fields ?? []).every((field) => !field.required || !!(values ?? {})[field.key]);
}
