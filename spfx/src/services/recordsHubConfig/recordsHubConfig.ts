import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import {
  IChannelOption,
  IContentType,
  ICorrespondenceTypeOption,
  IExternalOrganization,
  IOriginatingFunction,
} from '../../models/ICorrespondenceMetadata';
import { ICourierConfig, DEFAULT_COURIERS } from '../../models/ICourierConfig';

/**
 * CORMS_AdminConfig keys that make the Create Correspondence → RecordsHub integration configurable
 * per tenant/environment — the whole point being that moving to another tenant is an Admin Config
 * edit, never a code change. All Integration-category rows, so they surface (and are editable) on
 * the Admin Config screen automatically (AdminConfigServiceLive.getEntries excludes DataSource).
 *
 * The three *ListUrl keys hold the plain "AllItems.aspx" URL an admin copies straight from the
 * RecordsHub list in the browser — parseSharePointListUrl turns it into the REST endpoint.
 */
export const RECORDS_HUB_CONFIG_KEYS = {
  /** Browser URL of the RH_RecordsHub site registry list used by Attach Existing Document. */
  recordsHubRegistryListUrl: 'recordsHub.recordsHubRegistryListUrl',
  securityLevelsListUrl: 'recordsHub.securityLevelsListUrl',
  classificationsListUrl: 'recordsHub.classificationsListUrl',
  orgSecurityListUrl: 'recordsHub.orgSecurityListUrl',
  numberingListUrl: 'recordsHub.numberingListUrl',
  /** Id (or Title) of the RH_RMNumberings record CORMS reads + increments for numbering. Kept as the
   * fallback/legacy single-series key; the per-direction keys below take precedence when set. */
  numberingRecordId: 'recordsHub.numberingRecordId',
  /** CMS AC8 — separate Incoming/Outgoing numbering series: the RH_RMNumberings record (Title or Id)
   * per direction. Blank falls back to numberingRecordId, so a single-series tenant is unchanged. */
  numberingRecordIdIncoming: 'recordsHub.numberingRecordId.incoming',
  numberingRecordIdOutgoing: 'recordsHub.numberingRecordId.outgoing',
  externalOrganizationsJson: 'admin.externalOrganizationsJson',
  contentTypesJson: 'admin.contentTypesJson',
  correspondenceTypesJson: 'admin.correspondenceTypesJson',
  originatingFunctionsJson: 'admin.originatingFunctionsJson',
  couriersJson: 'admin.couriersJson',
  /** JSON list of Channel options (Email / Scan / Fax) for the Create Correspondence Channel DDL. */
  channelsJson: 'admin.channelsJson',
} as const;

/** The RH_RMNumberings record titles CORMS uses per direction by default — matching the two records
 * on the RecordsHub numbering list (CORMS_Incoming / CORMS_Outgoing). Used when no explicit
 * per-direction Admin Config override is set. */
export const DEFAULT_NUMBERING_RECORD_INCOMING = 'CORMS_Incoming';
export const DEFAULT_NUMBERING_RECORD_OUTGOING = 'CORMS_Outgoing';

/**
 * CMS AC8 — resolves which RH_RMNumberings record to read/increment for a direction, so Incoming
 * and Outgoing never share a serial. Precedence:
 *   1. the explicit per-direction Admin Config key (recordsHub.numberingRecordId.incoming/.outgoing);
 *   2. an explicit *custom* single-series key (recordsHub.numberingRecordId) — honored for a genuine
 *      single-series tenant, EXCEPT the legacy default value 'CORMS', which predates the split and
 *      is treated as "unset" so an existing tenant automatically moves to the per-direction records
 *      without re-provisioning or a manual Admin Config edit;
 *   3. the built-in per-direction default title (CORMS_Incoming / CORMS_Outgoing).
 */
export function resolveNumberingRecordId(values: Record<string, string>, direction: 'Incoming' | 'Outgoing'): string {
  const perDirectionKey =
    direction === 'Incoming' ? RECORDS_HUB_CONFIG_KEYS.numberingRecordIdIncoming : RECORDS_HUB_CONFIG_KEYS.numberingRecordIdOutgoing;
  const perDirection = (values[perDirectionKey] ?? '').trim();
  if (perDirection) return perDirection;
  const single = (values[RECORDS_HUB_CONFIG_KEYS.numberingRecordId] ?? '').trim();
  if (single && single.toUpperCase() !== 'CORMS') return single;
  return direction === 'Incoming' ? DEFAULT_NUMBERING_RECORD_INCOMING : DEFAULT_NUMBERING_RECORD_OUTGOING;
}

export interface IListEndpoint {
  /** Site (web) absolute URL, e.g. https://tenant.sharepoint.com/sites/RecordsHub */
  webUrl: string;
  /** List root-folder server-relative URL, e.g. /sites/RecordsHub/Lists/RH_SecurityLevels —
   * used with web/getList(...) so we don't have to guess the list's display Title from its URL. */
  listServerRelativeUrl: string;
}

/**
 * Parses a SharePoint list "AllItems.aspx" URL (what an admin copies from the browser address bar)
 * into the pieces the REST API needs. Splits the pathname on '/Lists/': the part before is the
 * web's server-relative path, the first segment after is the list's URL name; the view/query are
 * dropped. Returns undefined for empty or unrecognizable input, so callers can treat "not
 * configured" and "misconfigured" identically.
 */
export function parseSharePointListUrl(rawUrl: string | undefined): IListEndpoint | undefined {
  if (!rawUrl || !rawUrl.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return undefined;
  }
  const marker = '/Lists/';
  const markerIdx = parsed.pathname.indexOf(marker);
  if (markerIdx === -1) return undefined;
  const webServerRelative = parsed.pathname.slice(0, markerIdx);
  const listName = parsed.pathname.slice(markerIdx + marker.length).split('/')[0];
  if (!listName) return undefined;
  return {
    webUrl: `${parsed.origin}${webServerRelative}`,
    listServerRelativeUrl: `${webServerRelative}${marker}${decodeURIComponent(listName)}`,
  };
}

function getListApi(endpoint: IListEndpoint): string {
  return `${endpoint.webUrl}/_api/web/getList('${endpoint.listServerRelativeUrl.replace(/'/g, "''")}')`;
}

export function listItemsApiUrl(endpoint: IListEndpoint): string {
  return `${getListApi(endpoint)}/items`;
}

export function listItemApiUrl(endpoint: IListEndpoint, itemId: number): string {
  return `${getListApi(endpoint)}/items(${itemId})`;
}

/**
 * Finds a list's GUID by matching its RootFolder server-relative URL, case-insensitively (and
 * ignoring a trailing slash). Used to reach a RecordsHub list by GUID instead of `getList(url)`,
 * which is case-sensitive — and the cross-site proxy can lowercase the URL, 404ing the call. GUID
 * access is both case-insensitive and rename-proof.
 */
export function findListIdByServerRelativeUrl(
  lists: Array<{ Id?: string; RootFolder?: { ServerRelativeUrl?: string } }>,
  serverRelativeUrl: string
): string | undefined {
  const target = serverRelativeUrl.replace(/\/+$/, '').toLowerCase();
  const match = lists.find(
    (list) => (list.RootFolder?.ServerRelativeUrl ?? '').replace(/\/+$/, '').toLowerCase() === target
  );
  return match?.Id;
}

/** Reads every CORMS_AdminConfig row into a plain key→value map. Returns {} when the list isn't
 * available yet, so callers degrade to "not configured" rather than throwing. */
export async function readAdminConfigValues(devSettings: IDevSettingsService): Promise<Record<string, string>> {
  const rows = (await devSettings.getSettings()) ?? [];
  const map: Record<string, string> = {};
  rows.forEach((row) => {
    map[row.key] = row.value;
  });
  return map;
}

function padCounter(value: number, width: number): string {
  const s = String(value);
  const w = width > 0 ? width : 1;
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

export interface INumberingRecordFields {
  pattern: string;
  /** The value to render — already the next counter (last + increment). */
  counter: number;
  digit: number;
  prefix?: string;
  separator?: string;
  volumeSymbol?: string;
  /** Function code of the correspondence being numbered (e.g. LEG) — fills {Function}/{Func}. */
  functionCode?: string;
  /** Content-type code of the correspondence (e.g. LTR) — fills {ContentType}/{DocType}/{Doc}. */
  contentCode?: string;
}

/**
 * Expands the RH_RMNumberings Pattern into a concrete number. Supports the tokens a
 * CORMS-authored numbering record uses — {Digit} (zero-padded counter to the record's Digit
 * width), {Prefix}, {Seperator}/{Separator}, {Symbol}/{VolumeSymbol}, {YYYY}, {YY}, and the
 * per-correspondence {Function}/{Func} and {ContentType}/{DocType}/{Doc} codes. So a record whose
 * Pattern is e.g. `OQ8-{Function}-{ContentType}-{YY}-{Digit}` yields `OQ8-LEG-LTR-25-0002`. Unknown
 * tokens (e.g. the RecordsHub-internal {Parent.Classification}) are left verbatim rather than
 * blanked, so a misread never silently corrupts a number.
 */
export function expandNumberingPattern(fields: INumberingRecordFields, now: Date = new Date()): string {
  const year = now.getFullYear();
  const tokens: Record<string, string> = {
    Digit: padCounter(fields.counter, fields.digit),
    Prefix: fields.prefix ?? '',
    Seperator: fields.separator ?? '',
    Separator: fields.separator ?? '',
    Symbol: fields.volumeSymbol ?? '',
    VolumeSymbol: fields.volumeSymbol ?? '',
    YYYY: String(year),
    YY: padCounter(year % 100, 2),
    Function: fields.functionCode ?? '',
    Func: fields.functionCode ?? '',
    ContentType: fields.contentCode ?? '',
    DocType: fields.contentCode ?? '',
    Doc: fields.contentCode ?? '',
  };
  return fields.pattern.replace(/\{([^}]+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(tokens, name) ? tokens[name] : whole
  );
}

type RawItem = Record<string, unknown>;

/** First key present on the item among the candidates — lets us read *and* write back the same
 * column without guessing the internal name SharePoint gave a spaced display name. */
export function matchingKey(item: RawItem, candidates: string[]): string | undefined {
  return candidates.find((key) => key in item);
}

function readNum(item: RawItem, candidates: string[], fallback: number): number {
  const key = matchingKey(item, candidates);
  const value = key ? Number(item[key]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

function readStr(item: RawItem, candidates: string[]): string {
  const key = matchingKey(item, candidates);
  const value = key ? item[key] : undefined;
  return value === undefined || value === null ? '' : String(value);
}

// Candidate internal column names per field. RH_RMNumberings uses RH_-prefixed internal names
// (e.g. RH_LastCounter for the "Last Counter" display column, RH_Seperator1 for "Separator"); the
// generic/spaced variants stay as fallbacks for other tenants' schemas.
const LAST_COUNTER_KEYS = ['RH_LastCounter', 'LastCounter', 'Last_x0020_Counter', 'Last Counter'];
const INCREMENT_KEYS = ['RH_Increment', 'Increment'];
const DIGIT_KEYS = ['RH_Digit', 'Digit'];
const PATTERN_KEYS = ['RH_Pattern', 'Pattern'];
const PREFIX_KEYS = ['RH_Prefix', 'Prefix'];
const SEPARATOR_KEYS = ['RH_Seperator1', 'RH_Seperator', 'RH_Separator', 'Seperator', 'Separator'];
const VOLUME_SYMBOL_KEYS = ['RH_VolumeSymbol', 'Volume_x0020_Symbol', 'VolumeSymbol', 'Symbol'];

/**
 * CMS AC9 — whether a numbering series' serial should restart for a new calendar year. True only
 * when a stored marker year is known AND differs from the current year. A missing marker
 * (`undefined` — the row/list doesn't exist yet) deliberately does NOT trigger a reset, so numbering
 * keeps incrementing via the RH counter instead of restarting at the first serial every time.
 */
export function shouldResetNumberingForYear(markerYear: number | undefined, currentYear: number): boolean {
  return markerYear !== undefined && markerYear !== currentYear;
}

export interface INumberingUpdate {
  referenceNumber: string;
  /** The RH_RMNumberings column to write the incremented counter back to (the same one read). */
  counterKey: string;
  nextCounter: number;
}

/** Per-correspondence context that fills the Pattern's {Function}/{ContentType} tokens. */
export interface INumberingContext {
  functionCode?: string;
  contentCode?: string;
}

/**
 * Pure core of live numbering (factored out so it's testable without @microsoft/sp-http, which
 * can't be required under Jest). Given a raw RH_RMNumberings record, renders its Pattern with
 * (LastCounter + Increment) plus the per-correspondence function/content codes, and reports which
 * counter column to write the incremented value back to. Field names are matched defensively
 * because the RH list's internal column names aren't fixed in CORMS.
 */
export function computeNumberingUpdate(
  record: RawItem,
  context: INumberingContext = {},
  now?: Date,
  // CMS AC9 — when the series' year has rolled over, the counter restarts: the previous LastCounter
  // is ignored and the next number is the first of the new year (0 + Increment). The caller decides
  // when a rollover happened (it owns the per-series last-issued-year state); this keeps the pure
  // counter math here.
  options: { resetToYearStart?: boolean } = {}
): INumberingUpdate {
  const lastCounter = options.resetToYearStart ? 0 : readNum(record, LAST_COUNTER_KEYS, 0);
  const increment = readNum(record, INCREMENT_KEYS, 1) || 1;
  const digit = readNum(record, DIGIT_KEYS, 4);
  const nextCounter = lastCounter + increment;
  const referenceNumber = expandNumberingPattern(
    {
      pattern: readStr(record, PATTERN_KEYS) || '{Digit}',
      counter: nextCounter,
      digit,
      prefix: readStr(record, PREFIX_KEYS),
      separator: readStr(record, SEPARATOR_KEYS),
      volumeSymbol: readStr(record, VOLUME_SYMBOL_KEYS),
      functionCode: context.functionCode,
      contentCode: context.contentCode,
    },
    now
  );
  return { referenceNumber, counterKey: matchingKey(record, LAST_COUNTER_KEYS) ?? 'RH_LastCounter', nextCounter };
}

interface IExternalOrgJsonEntry {
  id?: string;
  nameEn?: string;
  nameAr?: string;
  name?: string;
  email?: string;
  emails?: string[];
}

/**
 * Parses the admin.externalOrganizationsJson blob into external organizations. Tolerant of the
 * shapes an admin might hand-author: nameEn/nameAr (preferred), a bare `name`, and a single
 * `email` (an `emails` array is still accepted, taking its first entry). Returns [] for empty/
 * invalid JSON so a typo in Admin Config degrades the picker to empty rather than crashing Create
 * Correspondence.
 */
export function parseExternalOrganizationsJson(raw: string | undefined): IExternalOrganization[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as IExternalOrgJsonEntry[])
    .map((entry, index) => {
      const nameEn = (entry.nameEn ?? entry.name ?? '').trim();
      const nameAr = (entry.nameAr ?? '').trim();
      const name = nameEn || nameAr;
      if (!name) return undefined;
      const email = (entry.email ?? entry.emails?.[0] ?? '').trim();
      return {
        id: entry.id ?? String(index + 1),
        name,
        nameAr: nameAr || undefined,
        email: email || undefined,
      } as IExternalOrganization;
    })
    .filter((org): org is IExternalOrganization => !!org);
}

interface IBilingualJsonEntry {
  id?: string;
  value?: string;
  nameEn?: string;
  nameAr?: string;
  name?: string;
}

/**
 * Shared parser for the bilingual Admin Config option lists ({ id, nameEn, nameAr }). Tolerant of
 * `name`/`value` aliases; each display name falls back to the other language so a single-language
 * entry still renders. Returns [] for empty/invalid JSON so the field falls back to its built-ins.
 */
function parseBilingualOptions(raw: string | undefined): ICorrespondenceTypeOption[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as IBilingualJsonEntry[])
    .map((entry) => {
      const nameEn = (entry.nameEn ?? entry.name ?? '').trim();
      const nameAr = (entry.nameAr ?? '').trim();
      const id = (entry.id ?? entry.value ?? nameEn).trim();
      if (!id || (!nameEn && !nameAr)) return undefined;
      return { id, nameEn: nameEn || nameAr, nameAr: nameAr || nameEn };
    })
    .filter((option): option is ICorrespondenceTypeOption => !!option);
}

/**
 * Parses admin.correspondenceTypesJson. `id` is the value the app's logic relies on (numbering
 * direction, validation) and must stay 'Outgoing' / 'Incoming'; nameEn/nameAr are display labels.
 */
export function parseCorrespondenceTypesJson(raw: string | undefined): ICorrespondenceTypeOption[] {
  return parseBilingualOptions(raw);
}

/**
 * Parses admin.originatingFunctionsJson — bilingual { id, nameEn, nameAr }. Mapped to
 * IOriginatingFunction with `name` = the English label and `nameAr` the Arabic one.
 */
export function parseOriginatingFunctionsJson(raw: string | undefined): IOriginatingFunction[] {
  return parseBilingualOptions(raw).map((option) => ({ id: option.id, name: option.nameEn, nameAr: option.nameAr }));
}

/**
 * Parses admin.channelsJson — bilingual { id, nameEn, nameAr } (id/value/name aliases and a single-
 * language entry all tolerated, same as the other option lists). `id` is the stable value persisted
 * on the correspondence (Channel column); returns [] for empty/invalid JSON so the DDL simply shows
 * no options rather than crashing Create Correspondence.
 */
export function parseChannelsJson(raw: string | undefined): IChannelOption[] {
  return parseBilingualOptions(raw);
}

interface IContentTypeJsonEntry {
  id?: string;
  name?: string;
  value?: string;
}

/** Parses admin.contentTypesJson — an array of {id?,name} (or bare {value}, or plain strings).
 * Returns [] for empty/invalid JSON, same tolerant stance as external organizations above. */
export function parseContentTypesJson(raw: string | undefined): IContentType[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as Array<IContentTypeJsonEntry | string>)
    .map((entry, index) => {
      const name = typeof entry === 'string' ? entry.trim() : (entry.name ?? entry.value ?? '').trim();
      if (!name) return undefined;
      const id = typeof entry === 'string' ? name : entry.id ?? name;
      return { id, name } as IContentType;
    })
    .filter((ct): ct is IContentType => !!ct);
}

/**
 * Parses the admin-managed courier list (admin.couriersJson) into ICourierConfig[], keeping only
 * entries with an id + name and enabled !== false. Falls back to the built-in DEFAULT_COURIERS when
 * the JSON is blank or unparseable, so the Courier step always has options out of the box; returns
 * [] only when the admin has deliberately saved a valid empty array.
 */
export function parseCouriersJson(raw: string | undefined): ICourierConfig[] {
  if (!raw || !raw.trim()) return DEFAULT_COURIERS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_COURIERS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_COURIERS;
  return (parsed as ICourierConfig[])
    .filter((c) => c && typeof c === 'object' && !!c.id && !!c.name && c.enabled !== false)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name),
      description: c.description ? String(c.description) : undefined,
      refPrefix: c.refPrefix ? String(c.refPrefix) : undefined,
      enabled: true,
      fields: Array.isArray(c.fields)
        ? c.fields
            .filter((f) => f && !!f.key && !!f.label)
            .map((f) => ({
              key: String(f.key),
              label: String(f.label),
              type: f.type === 'text' ? 'text' : 'select',
              required: !!f.required,
              options: Array.isArray(f.options) ? f.options.map((o) => String(o)) : undefined,
              placeholder: f.placeholder ? String(f.placeholder) : undefined,
            }))
        : [],
    }));
}
