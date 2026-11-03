import {
  parseSharePointListUrl,
  listItemsApiUrl,
  listItemApiUrl,
  expandNumberingPattern,
  computeNumberingUpdate,
  parseExternalOrganizationsJson,
  parseContentTypesJson,
  parseCorrespondenceTypesJson,
  parseChannelsJson,
  parseOriginatingFunctionsJson,
  parseCouriersJson,
  resolveNumberingRecordId,
  shouldResetNumberingForYear,
  findListIdByServerRelativeUrl,
  readAdminConfigValues,
  RECORDS_HUB_CONFIG_KEYS,
} from '../recordsHubConfig';
import { DEFAULT_COURIERS } from '../../../models/ICourierConfig';
import { IDevSettingsService } from '../../interfaces/IDevSettingsService';

describe('parseSharePointListUrl', () => {
  it('keeps the RH_RecordsHub registry endpoint configurable through Admin Settings', () => {
    expect(RECORDS_HUB_CONFIG_KEYS.recordsHubRegistryListUrl).toBe('recordsHub.recordsHubRegistryListUrl');
    expect(
      parseSharePointListUrl(
        'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/Lists/RH_RecordsHub/AllItems.aspx'
      )
    ).toEqual({
      webUrl: 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2',
      listServerRelativeUrl: '/sites/SPEDRMSRecordsHubDev2/Lists/RH_RecordsHub',
    });
  });

  it('parses an AllItems.aspx URL into web + list server-relative URL, dropping the view/query', () => {
    const ep = parseSharePointListUrl(
      'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/Lists/RH_SecurityLevels/AllItems.aspx?viewid=abc-123'
    );
    expect(ep).toEqual({
      webUrl: 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2',
      listServerRelativeUrl: '/sites/SPEDRMSRecordsHubDev2/Lists/RH_SecurityLevels',
    });
  });

  it('decodes an encoded list URL segment', () => {
    const ep = parseSharePointListUrl(
      'https://t.sharepoint.com/sites/Hub/Lists/RH%20Org%20Security/AllItems.aspx'
    );
    expect(ep?.listServerRelativeUrl).toBe('/sites/Hub/Lists/RH Org Security');
  });

  it('returns undefined for empty, non-URL, or non-list input', () => {
    expect(parseSharePointListUrl(undefined)).toBeUndefined();
    expect(parseSharePointListUrl('   ')).toBeUndefined();
    expect(parseSharePointListUrl('not a url')).toBeUndefined();
    expect(parseSharePointListUrl('https://t.sharepoint.com/sites/Hub/SitePages/Home.aspx')).toBeUndefined();
  });

  it('builds the getList() REST endpoints', () => {
    const ep = parseSharePointListUrl('https://t.sharepoint.com/sites/Hub/Lists/RH_RMNumberings/AllItems.aspx')!;
    expect(listItemsApiUrl(ep)).toBe(
      "https://t.sharepoint.com/sites/Hub/_api/web/getList('/sites/Hub/Lists/RH_RMNumberings')/items"
    );
    expect(listItemApiUrl(ep, 16)).toBe(
      "https://t.sharepoint.com/sites/Hub/_api/web/getList('/sites/Hub/Lists/RH_RMNumberings')/items(16)"
    );
  });
});

describe('expandNumberingPattern', () => {
  const fixedNow = new Date('2026-03-04T00:00:00Z');

  it('zero-pads the counter to the Digit width and substitutes prefix/separator', () => {
    expect(
      expandNumberingPattern(
        { pattern: '{Prefix}{Seperator}{Digit}', counter: 42, digit: 5, prefix: 'PRT', separator: '-' },
        fixedNow
      )
    ).toBe('PRT-00042');
  });

  it('expands year and volume-symbol tokens', () => {
    expect(
      expandNumberingPattern(
        { pattern: '{YYYY}/{YY}/{Symbol}{Digit}', counter: 7, digit: 3, volumeSymbol: 'ع' },
        fixedNow
      )
    ).toBe('2026/26/ع007');
  });

  it('leaves unknown tokens (e.g. RecordsHub Parent.* refs) verbatim rather than blanking them', () => {
    expect(expandNumberingPattern({ pattern: '{Parent.Classification}-{Digit}', counter: 1, digit: 2 }, fixedNow)).toBe(
      '{Parent.Classification}-01'
    );
  });

  it('treats a zero/blank Digit width as width 1', () => {
    expect(expandNumberingPattern({ pattern: '{Digit}', counter: 9, digit: 0 }, fixedNow)).toBe('9');
  });
});

describe('resolveNumberingRecordId', () => {
  it('uses the explicit per-direction Admin Config keys when set', () => {
    const values = {
      'recordsHub.numberingRecordId.incoming': 'IN-REC',
      'recordsHub.numberingRecordId.outgoing': 'OUT-REC',
      'recordsHub.numberingRecordId': 'CORMS',
    };
    expect(resolveNumberingRecordId(values, 'Incoming')).toBe('IN-REC');
    expect(resolveNumberingRecordId(values, 'Outgoing')).toBe('OUT-REC');
  });

  it('treats the legacy single value "CORMS" as unset and uses the per-direction default records', () => {
    // Existing tenant: only the old single key is set — must move to the two records automatically.
    const values = { 'recordsHub.numberingRecordId': 'CORMS' };
    expect(resolveNumberingRecordId(values, 'Incoming')).toBe('CORMS_Incoming');
    expect(resolveNumberingRecordId(values, 'Outgoing')).toBe('CORMS_Outgoing');
  });

  it('defaults to the per-direction records when nothing is configured at all', () => {
    expect(resolveNumberingRecordId({}, 'Incoming')).toBe('CORMS_Incoming');
    expect(resolveNumberingRecordId({}, 'Outgoing')).toBe('CORMS_Outgoing');
  });

  it('still honors a genuine custom single-series record (not the legacy "CORMS")', () => {
    const values = { 'recordsHub.numberingRecordId': 'MYORG-SERIES' };
    expect(resolveNumberingRecordId(values, 'Incoming')).toBe('MYORG-SERIES');
    expect(resolveNumberingRecordId(values, 'Outgoing')).toBe('MYORG-SERIES');
  });
});

describe('shouldResetNumberingForYear', () => {
  it('does NOT reset when there is no stored marker (missing row / unprovisioned list)', () => {
    // The bug this guards: a missing marker used to force a reset, sticking every serial at 0001.
    expect(shouldResetNumberingForYear(undefined, 2026)).toBe(false);
  });
  it('does NOT reset when the stored year matches the current year', () => {
    expect(shouldResetNumberingForYear(2026, 2026)).toBe(false);
  });
  it('resets when the stored year differs from the current year', () => {
    expect(shouldResetNumberingForYear(2026, 2027)).toBe(true);
  });
});

describe('computeNumberingUpdate', () => {
  const now = new Date('2026-03-04T00:00:00Z');

  it('renders the pattern with (LastCounter + Increment) and reports the counter column to write back', () => {
    const update = computeNumberingUpdate(
      { Id: 16, Pattern: 'PRT-{Digit}', LastCounter: 20, Digit: 4, Increment: 1, Prefix: 'PRT' },
      {},
      now
    );
    expect(update).toEqual({ referenceNumber: 'PRT-0021', counterKey: 'LastCounter', nextCounter: 21 });
  });

  it('respects a custom increment and honors the spaced internal column name for read + write-back', () => {
    const update = computeNumberingUpdate({ Id: 3, Pattern: '{Digit}', Last_x0020_Counter: 100, Digit: 3, Increment: 5 }, {}, now);
    expect(update).toEqual({ referenceNumber: '105', counterKey: 'Last_x0020_Counter', nextCounter: 105 });
  });

  it('defaults a missing counter to 0 and increment to 1, defaulting the write-back column to RH_LastCounter', () => {
    const update = computeNumberingUpdate({ Id: 1, Pattern: 'N-{Digit}', Digit: 2 }, {}, now);
    expect(update).toEqual({ referenceNumber: 'N-01', counterKey: 'RH_LastCounter', nextCounter: 1 });
  });

  it('expands the correspondence function/content codes and year into the composite CORMS format', () => {
    const update = computeNumberingUpdate(
      { Id: 20, Pattern: 'OQ8-{Function}-{ContentType}-{YY}-{Digit}', LastCounter: 1, Digit: 3, Increment: 1 },
      { functionCode: 'LEG', contentCode: 'LTR' },
      now
    );
    expect(update.referenceNumber).toBe('OQ8-LEG-LTR-26-002');
    expect(update.nextCounter).toBe(2);
  });

  it("reads and writes back the real RH_-prefixed RH_RMNumberings columns (RH_LastCounter, RH_Pattern, ...)", () => {
    const update = computeNumberingUpdate(
      {
        Id: 37,
        RH_Pattern: 'OQ8-{Function}-{ContentType}-{YY}-{Digit}',
        RH_LastCounter: 1,
        RH_Digit: 3,
        RH_Increment: 1,
        RH_Seperator1: '-',
      },
      { functionCode: 'LEG', contentCode: 'LTR' },
      now
    );
    expect(update.referenceNumber).toBe('OQ8-LEG-LTR-26-002');
    // Critical: writes back to RH_LastCounter (the real internal name), not the missing LastCounter.
    expect(update.counterKey).toBe('RH_LastCounter');
    expect(update.nextCounter).toBe(2);
  });

  it('AC9 — resetToYearStart ignores the prior LastCounter and restarts the serial at the year start', () => {
    const update = computeNumberingUpdate(
      { Id: 20, Pattern: 'OQ8-{Function}-{ContentType}-{YY}-{Digit}', LastCounter: 145, Digit: 4, Increment: 1 },
      { functionCode: 'LEG', contentCode: 'LTR' },
      now,
      { resetToYearStart: true }
    );
    // Previous counter (145) is discarded — the new year's first number is Increment (1), not 146.
    expect(update.referenceNumber).toBe('OQ8-LEG-LTR-26-0001');
    expect(update.nextCounter).toBe(1);
  });
});

describe('parseExternalOrganizationsJson', () => {
  it('maps nameEn/nameAr/email and assigns ids when absent', () => {
    const orgs = parseExternalOrganizationsJson(
      JSON.stringify([{ nameEn: 'Ministry of Health', nameAr: 'وزارة الصحة', email: 'a@moh.gov' }])
    );
    expect(orgs).toEqual([{ id: '1', name: 'Ministry of Health', nameAr: 'وزارة الصحة', email: 'a@moh.gov' }]);
  });

  it('accepts a bare name and takes the first entry of a legacy emails array', () => {
    const orgs = parseExternalOrganizationsJson(JSON.stringify([{ id: 'x', name: 'Acme', emails: ['x@acme.com', 'y@acme.com'] }]));
    expect(orgs).toEqual([{ id: 'x', name: 'Acme', nameAr: undefined, email: 'x@acme.com' }]);
  });

  it('falls back to the Arabic name when only nameAr is present', () => {
    expect(parseExternalOrganizationsJson(JSON.stringify([{ nameAr: 'شركة' }]))[0].name).toBe('شركة');
  });

  it('returns [] for empty, invalid, or non-array JSON', () => {
    expect(parseExternalOrganizationsJson('')).toEqual([]);
    expect(parseExternalOrganizationsJson('{ not json')).toEqual([]);
    expect(parseExternalOrganizationsJson('{"a":1}')).toEqual([]);
  });
});

describe('parseCouriersJson', () => {
  it('falls back to the built-in couriers for blank/invalid input', () => {
    expect(parseCouriersJson(undefined)).toBe(DEFAULT_COURIERS);
    expect(parseCouriersJson('')).toBe(DEFAULT_COURIERS);
    expect(parseCouriersJson('not json')).toBe(DEFAULT_COURIERS);
  });

  it('keeps enabled couriers, drops disabled ones, and normalises fields', () => {
    const json = JSON.stringify([
      { id: 'x', name: 'Courier X', refPrefix: 'CX', fields: [{ key: 'lvl', label: 'Level', type: 'select', required: true, options: ['A', 'B'] }] },
      { id: 'y', name: 'Hidden Y', enabled: false },
      { id: '', name: 'No id' },
    ]);
    const result = parseCouriersJson(json);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'x',
      name: 'Courier X',
      description: undefined,
      refPrefix: 'CX',
      enabled: true,
      fields: [{ key: 'lvl', label: 'Level', type: 'select', required: true, options: ['A', 'B'], placeholder: undefined }],
    });
  });

  it('returns an empty list when the admin saved a valid empty array', () => {
    expect(parseCouriersJson('[]')).toEqual([]);
  });
});

describe('parseContentTypesJson', () => {
  it('accepts objects and plain strings', () => {
    expect(parseContentTypesJson(JSON.stringify([{ id: 'l', name: 'Letter' }, 'Memo']))).toEqual([
      { id: 'l', name: 'Letter' },
      { id: 'Memo', name: 'Memo' },
    ]);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseContentTypesJson('nope')).toEqual([]);
  });
});

describe('parseCorrespondenceTypesJson', () => {
  it('maps id + bilingual labels', () => {
    expect(
      parseCorrespondenceTypesJson(
        JSON.stringify([{ id: 'Outgoing', nameEn: 'Outgoing', nameAr: 'صادر' }, { id: 'Incoming', nameEn: 'Incoming', nameAr: 'وارد' }])
      )
    ).toEqual([
      { id: 'Outgoing', nameEn: 'Outgoing', nameAr: 'صادر' },
      { id: 'Incoming', nameEn: 'Incoming', nameAr: 'وارد' },
    ]);
  });

  it('fills a missing language from the other and derives id from the name', () => {
    expect(parseCorrespondenceTypesJson(JSON.stringify([{ nameEn: 'Outgoing' }]))).toEqual([
      { id: 'Outgoing', nameEn: 'Outgoing', nameAr: 'Outgoing' },
    ]);
  });

  it('returns [] for empty or invalid JSON', () => {
    expect(parseCorrespondenceTypesJson('')).toEqual([]);
    expect(parseCorrespondenceTypesJson('nope')).toEqual([]);
  });
});

describe('parseChannelsJson', () => {
  it('maps id + bilingual labels for the Channel DDL', () => {
    expect(
      parseChannelsJson(
        JSON.stringify([
          { id: 'Email', nameEn: 'Email', nameAr: 'بريد إلكتروني' },
          { id: 'Scan', nameEn: 'Scan', nameAr: 'مسح ضوئي' },
          { id: 'Fax', nameEn: 'Fax', nameAr: 'فاكس' },
        ])
      )
    ).toEqual([
      { id: 'Email', nameEn: 'Email', nameAr: 'بريد إلكتروني' },
      { id: 'Scan', nameEn: 'Scan', nameAr: 'مسح ضوئي' },
      { id: 'Fax', nameEn: 'Fax', nameAr: 'فاكس' },
    ]);
  });

  it('derives id from the name when only a label is given', () => {
    expect(parseChannelsJson(JSON.stringify([{ nameEn: 'Fax' }]))).toEqual([{ id: 'Fax', nameEn: 'Fax', nameAr: 'Fax' }]);
  });

  it('returns [] for empty or invalid JSON so the DDL just shows its placeholder', () => {
    expect(parseChannelsJson('')).toEqual([]);
    expect(parseChannelsJson('nope')).toEqual([]);
  });
});

describe('parseOriginatingFunctionsJson', () => {
  it('maps bilingual entries to { id, name (EN), nameAr }', () => {
    expect(
      parseOriginatingFunctionsJson(JSON.stringify([{ id: 'fn-1', nameEn: 'Legal Affairs', nameAr: 'الشؤون القانونية' }]))
    ).toEqual([{ id: 'fn-1', name: 'Legal Affairs', nameAr: 'الشؤون القانونية' }]);
  });

  it('returns [] for empty or invalid JSON', () => {
    expect(parseOriginatingFunctionsJson('')).toEqual([]);
    expect(parseOriginatingFunctionsJson('nope')).toEqual([]);
  });
});

describe('findListIdByServerRelativeUrl', () => {
  const lists = [
    { Id: 'guid-a', RootFolder: { ServerRelativeUrl: '/sites/Hub/Lists/RH_SecurityLevels' } },
    { Id: 'guid-b', RootFolder: { ServerRelativeUrl: '/sites/Hub/Lists/RH_RMNumberings' } },
  ];

  it('matches case-insensitively and ignores a trailing slash (proxy may lowercase the URL)', () => {
    expect(findListIdByServerRelativeUrl(lists, '/sites/hub/lists/rh_rmnumberings/')).toBe('guid-b');
  });

  it('returns undefined when no list matches', () => {
    expect(findListIdByServerRelativeUrl(lists, '/sites/Hub/Lists/Missing')).toBeUndefined();
  });
});

describe('readAdminConfigValues', () => {
  it('flattens rows into a key→value map', async () => {
    const devSettings: IDevSettingsService = {
      getSettings: () => Promise.resolve([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]),
      saveSettings: () => Promise.resolve(),
    };
    expect(await readAdminConfigValues(devSettings)).toEqual({ a: '1', b: '2' });
  });

  it('returns {} when the backing list is unavailable', async () => {
    const devSettings: IDevSettingsService = {
      getSettings: () => Promise.resolve(undefined),
      saveSettings: () => Promise.resolve(),
    };
    expect(await readAdminConfigValues(devSettings)).toEqual({});
  });
});
