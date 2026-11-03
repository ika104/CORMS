import {
  buildElasticSearchBody,
  buildAuthHeader,
  buildSnippet,
  extractHighlightSnippet,
  stripHighlightTags,
  isContentIndex,
  resolveHitListName,
  hitMatchesList,
  mapElasticHitToCorrespondence,
  correspondenceMatchesFilters,
  isAuditingEnabled,
  normalizeSiteUrl,
  siteContentIndexFromId,
  resolveSiteContentIndex,
  ELASTIC_CONFIG_KEYS,
  SEARCH_HIGHLIGHT,
  IElasticHit,
  ISiteRegistryHit,
} from '../elasticQuery';
import { ICorrespondenceStub } from '../../../models/ICorrespondence';

describe('per-site content index resolution (sharepoint_sites)', () => {
  const cormsId = 'ssloman.sharepoint.com,131bdbd3-731d-4768-9778-c39d1bff57f3,a0669d66-e66c-4d31-97bc-0a9f67ddc547';
  const cormsIndex = 'ssloman.sharepoint.com_131bdbd3-731d-4768-9778-c39d1bff57f3_a0669d66-e66c-4d31-97bc-0a9f67ddc547';
  const sites: ISiteRegistryHit[] = [
    { _id: 'ssloman.sharepoint.com_a_b', _source: { id: 'ssloman.sharepoint.com,a,b', name: 'Other', RH_SiteURL: 'https://ssloman.sharepoint.com/sites/Other' } },
    { _id: cormsIndex, _source: { id: cormsId, name: 'CORMS', RH_SiteURL: 'https://ssloman.sharepoint.com/sites/CORMS' } },
  ];

  it('siteContentIndexFromId turns the comma identity into the underscore index name', () => {
    expect(siteContentIndexFromId(cormsId)).toBe(cormsIndex);
    expect(siteContentIndexFromId(undefined)).toBe('');
  });

  it('normalizeSiteUrl is case- and trailing-slash-insensitive', () => {
    expect(normalizeSiteUrl('https://ssloman.sharepoint.com/sites/CORMS/')).toBe('https://ssloman.sharepoint.com/sites/corms');
    expect(normalizeSiteUrl(undefined)).toBe('');
  });

  it('resolves the CORMS site to its per-site content index by URL (slash/case tolerant)', () => {
    expect(resolveSiteContentIndex(sites, 'https://ssloman.sharepoint.com/sites/CORMS')).toBe(cormsIndex);
    expect(resolveSiteContentIndex(sites, 'https://SSLOMAN.sharepoint.com/sites/CORMS/')).toBe(cormsIndex);
  });

  it('falls back to deriving the index from _source.id when the hit has no _id', () => {
    const noId: ISiteRegistryHit[] = [{ _source: { id: cormsId, RH_SiteURL: 'https://ssloman.sharepoint.com/sites/CORMS' } }];
    expect(resolveSiteContentIndex(noId, 'https://ssloman.sharepoint.com/sites/CORMS')).toBe(cormsIndex);
  });

  it('returns undefined when no site matches (caller then searches all indices)', () => {
    expect(resolveSiteContentIndex(sites, 'https://ssloman.sharepoint.com/sites/Missing')).toBeUndefined();
    expect(resolveSiteContentIndex([], 'https://ssloman.sharepoint.com/sites/CORMS')).toBeUndefined();
    expect(resolveSiteContentIndex(sites, '')).toBeUndefined();
  });
});

describe('isAuditingEnabled', () => {
  const key = ELASTIC_CONFIG_KEYS.auditEnabled;
  it('defaults to enabled when the key is missing or blank (older tenants)', () => {
    expect(isAuditingEnabled({})).toBe(true);
    expect(isAuditingEnabled({ [key]: '' })).toBe(true);
    expect(isAuditingEnabled({ [key]: '   ' })).toBe(true);
  });
  it('is disabled only for an explicit "false" (case/space-insensitive)', () => {
    expect(isAuditingEnabled({ [key]: 'false' })).toBe(false);
    expect(isAuditingEnabled({ [key]: 'FALSE' })).toBe(false);
    expect(isAuditingEnabled({ [key]: ' false ' })).toBe(false);
  });
  it('stays enabled for "true" or any other value', () => {
    expect(isAuditingEnabled({ [key]: 'true' })).toBe(true);
    expect(isAuditingEnabled({ [key]: 'yes' })).toBe(true);
  });
});

describe('buildElasticSearchBody', () => {
  it('builds a simple_query_string query with a highlight clause for a term', () => {
    expect(buildElasticSearchBody('budget report', 50)).toEqual({
      size: 50,
      query: { simple_query_string: { query: 'budget report', default_operator: 'and', lenient: true } },
      highlight: SEARCH_HIGHLIGHT,
    });
  });

  it('falls back to match_all for a blank term but still asks for highlights', () => {
    expect(buildElasticSearchBody('   ', 10)).toEqual({ size: 10, query: { match_all: {} }, highlight: SEARCH_HIGHLIGHT });
  });

  it('scopes to the list server-side when a list name is given (base + .keyword)', () => {
    expect(buildElasticSearchBody('budget', 25, 'CORMS_Correspondence')).toEqual({
      size: 25,
      query: {
        bool: {
          must: [{ simple_query_string: { query: 'budget', default_operator: 'and', lenient: true } }],
          filter: [
            {
              bool: {
                should: [
                  { term: { 'parentReference.list.name': 'CORMS_Correspondence' } },
                  { term: { 'parentReference.list.name.keyword': 'CORMS_Correspondence' } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
      highlight: SEARCH_HIGHLIGHT,
    });
  });

  it('list scoping also wraps a blank-term match_all', () => {
    const body = buildElasticSearchBody('', 5, 'CORMS_Tasks') as { query: { bool: { must: unknown[] } } };
    expect(body.query.bool.must).toEqual([{ match_all: {} }]);
  });

  it('keeps the highlight clause field-agnostic (CMS-026 AC3)', () => {
    expect(SEARCH_HIGHLIGHT.fields).toEqual({ '*': {} });
    expect(SEARCH_HIGHLIGHT.require_field_match).toBe(false);
  });
});

describe('highlight snippets (CMS-026 AC3)', () => {
  it('strips the <em> delimiters from a fragment', () => {
    expect(stripHighlightTags('the <em>budget</em> for <em>Q4</em>')).toBe('the budget for Q4');
  });

  it('extracts the first fragment across fields as plain text', () => {
    const hit: IElasticHit = {
      _source: {},
      highlight: { content: ['see the <em>invoice</em> attached'], Title: ['<em>Invoice</em> 2026'] },
    };
    expect(extractHighlightSnippet(hit)).toBe('see the invoice attached');
  });

  it('returns undefined when the hit has no highlight', () => {
    expect(extractHighlightSnippet({ _source: {} })).toBeUndefined();
  });

  it('skips the parentReference list-name highlight (the filter term) rather than showing it as a snippet', () => {
    // Blank browse: the ONLY highlight is the filter term on parentReference — must yield no snippet
    // so rows do not all show a bogus "CORMS_Correspondence" subtitle.
    const blank: IElasticHit = {
      _source: {},
      highlight: {
        'parentReference.list.name.keyword': ['<em>CORMS_Correspondence</em>'],
        'parentReference.list.displayName.keyword': ['<em>CORMS_Correspondence</em>'],
      },
    };
    expect(extractHighlightSnippet(blank)).toBeUndefined();
  });

  it('prefers a real content field over the skipped parentReference highlight', () => {
    const hit: IElasticHit = {
      _source: {},
      highlight: {
        'parentReference.list.name.keyword': ['<em>CORMS_Correspondence</em>'],
        'fields.Title': ['<em>test</em> letter'],
      },
    };
    expect(extractHighlightSnippet(hit)).toBe('test letter');
  });

  it('buildSnippet windows around the first match with ellipses', () => {
    const text = 'A'.repeat(100) + ' budget ' + 'B'.repeat(100);
    const snip = buildSnippet(text, 'budget', 10);
    expect(snip).toContain('budget');
    expect(snip!.startsWith('…')).toBe(true);
    expect(snip!.endsWith('…')).toBe(true);
  });

  it('buildSnippet returns undefined for a blank term or no match', () => {
    expect(buildSnippet('some text', '')).toBeUndefined();
    expect(buildSnippet('some text', 'zzz')).toBeUndefined();
  });
});

describe('buildAuthHeader', () => {
  it('prefixes the ApiKey scheme', () => {
    expect(buildAuthHeader('abc123')).toBe('ApiKey abc123');
  });
  it('leaves an already-prefixed value alone', () => {
    expect(buildAuthHeader('ApiKey abc123')).toBe('ApiKey abc123');
  });
  it('returns undefined for a blank key', () => {
    expect(buildAuthHeader('  ')).toBeUndefined();
  });
});

describe('mapElasticHitToCorrespondence', () => {
  it('maps SharePoint-style column names, deriving the tier from the SecurityLevel string', () => {
    const hit: IElasticHit = {
      _id: '13_42',
      _source: {
        ItemId: '42',
        Title: 'Budget request',
        ReferenceNo: 'OQ8-FIN-LTR-26-0001',
        CorrespondenceType: 'Outgoing',
        Direction: 'Outgoing',
        Status: 'In Review',
        Priority: 'High',
        SecurityLevel: 'Secret',
        DestinationDepartments: 'Finance',
        DateCreated: '2026-08-31T09:00:00.000Z',
        Sender: 'Alice',
        Recipient: 'Bob',
      },
    };
    expect(mapElasticHitToCorrespondence(hit)).toEqual<ICorrespondenceStub>({
      id: '42',
      referenceNumber: 'OQ8-FIN-LTR-26-0001',
      subject: 'Budget request',
      type: 'Outgoing',
      direction: 'Outgoing',
      status: 'InReview',
      priority: 'High',
      securityTier: 4,
      department: 'Finance',
      createdAt: '2026-08-31',
      senderName: 'Alice',
      recipientName: 'Bob',
      dueDate: undefined,
    });
  });

  it('carries the highlight fragment through as searchSnippet (CMS-026 AC3)', () => {
    const hit: IElasticHit = {
      _id: '5',
      _source: { ItemId: '5', Title: 'Contract' },
      highlight: { content: ['…the <em>contract</em> terms…'] },
    };
    expect(mapElasticHitToCorrespondence(hit).searchSnippet).toBe('…the contract terms…');
  });

  it('reads fields nested under fields.* and falls back to _id when no item id is present', () => {
    const hit: IElasticHit = {
      _id: '13_7',
      _source: { fields: { Title: 'Memo', SecurityLevel: '3' } },
    };
    const result = mapElasticHitToCorrespondence(hit);
    expect(result.subject).toBe('Memo');
    expect(result.securityTier).toBe(3); // numeric SecurityLevel used directly
    expect(result.id).toBe('13_7');
    expect(result.status).toBe('Draft'); // unknown status defaults
    expect(result.direction).toBe('Incoming');
  });
});

describe('isContentIndex — blank-index safety net (CMS-025/026)', () => {
  it('excludes Elasticsearch system and sync-bookkeeping indices', () => {
    expect(isContentIndex('.elastic-connectors-v1')).toBe(false);
    expect(isContentIndex('.kibana')).toBe(false);
    expect(isContentIndex('delta_links')).toBe(false);
    expect(isContentIndex('sharepoint_sites')).toBe(false);
    expect(isContentIndex('recordhubhr_delta_links')).toBe(false);
    expect(isContentIndex('recordhubhr_duplicate')).toBe(false);
    expect(isContentIndex('rhduplicate')).toBe(false);
  });

  it('keeps the connector content index and per-site record indices', () => {
    expect(isContentIndex('connector-sharepoint-online-93db')).toBe(true);
    expect(isContentIndex('ssloman.sharepoint.com_1fe59b36_ae2ea71a')).toBe(true);
    expect(isContentIndex('corms_correspondence')).toBe(true);
    expect(isContentIndex(undefined)).toBe(true);
  });
});

describe('per-site list discriminator (CMS-025) — against the real RecordsHub per-site shape', () => {
  // Shape confirmed from a live per-site index doc: item columns under fields.*, the source list
  // in parentReference.list.name.
  const linkHit: IElasticHit = {
    _index: 'ssloman.sharepoint.com_6a77853c_4d802c1b',
    _id: 'f16d4eaf_2240',
    _source: {
      webUrl: 'https://ssloman.sharepoint.com/sites/X/Lists/RH_Links/2240_.000',
      parentReference: { list: { name: 'RH_Links', displayName: 'Links' } },
      fields: { id: '2240', Created: '2025-12-24T16:07:57Z' },
    },
  };
  const correspondenceHit: IElasticHit = {
    _index: 'ssloman.sharepoint.com_corms_web',
    _id: 'listguid_42',
    _source: {
      parentReference: { list: { name: 'CORMS_Correspondence', displayName: 'Correspondence' } },
      fields: { id: '42', Title: 'Budget request', ReferenceNo: 'OQ8-FIN-LTR-26-0001' },
    },
  };

  it('resolves the source list from parentReference', () => {
    expect(resolveHitListName(linkHit)).toBe('RH_Links');
    expect(resolveHitListName(correspondenceHit)).toBe('CORMS_Correspondence');
    expect(resolveHitListName({ _source: {} })).toBeUndefined();
  });

  it('keeps only the configured correspondence list, case-insensitively', () => {
    expect(hitMatchesList(correspondenceHit, 'CORMS_Correspondence')).toBe(true);
    expect(hitMatchesList(correspondenceHit, 'corms_correspondence')).toBe(true);
    expect(hitMatchesList(linkHit, 'CORMS_Correspondence')).toBe(false);
  });

  it('is lenient: a blank list name or a hit with no parentReference is kept', () => {
    expect(hitMatchesList(linkHit, '')).toBe(true);
    expect(hitMatchesList({ _source: {} }, 'CORMS_Correspondence')).toBe(true);
  });

  it('maps a per-site correspondence hit, reading fields.* and the item id', () => {
    const mapped = mapElasticHitToCorrespondence(correspondenceHit);
    expect(mapped.id).toBe('42');
    expect(mapped.subject).toBe('Budget request');
    expect(mapped.referenceNumber).toBe('OQ8-FIN-LTR-26-0001');
  });
});

describe('correspondenceMatchesFilters', () => {
  const base: ICorrespondenceStub = {
    id: '1',
    referenceNumber: 'R1',
    subject: 's',
    type: 'Outgoing',
    direction: 'Outgoing',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 3,
    department: 'Finance',
    createdAt: '2026-08-15',
  };

  it('passes when no filters are set', () => {
    expect(correspondenceMatchesFilters(base, {})).toBe(true);
  });
  it('filters by status, security tier and team', () => {
    expect(correspondenceMatchesFilters(base, { status: 'Draft' })).toBe(false);
    expect(correspondenceMatchesFilters(base, { securityLevel: '3' })).toBe(true);
    expect(correspondenceMatchesFilters(base, { securityLevel: '4' })).toBe(false);
    expect(correspondenceMatchesFilters(base, { team: 'Legal' })).toBe(false);
  });
  it('filters by date range', () => {
    expect(correspondenceMatchesFilters(base, { dateFrom: '2026-08-01', dateTo: '2026-08-31' })).toBe(true);
    expect(correspondenceMatchesFilters(base, { dateFrom: '2026-09-01' })).toBe(false);
  });

  it('filters by the CMS-025 metadata fields', () => {
    const item: ICorrespondenceStub = { ...base, referenceNumber: 'OQ8-FIN-0007', subject: 'Q4 Budget', senderName: 'Alice', recipientName: 'Bob', type: 'Letter', priority: 'High' };
    // Reference No. / Subject / Sender / Recipient are case-insensitive substrings.
    expect(correspondenceMatchesFilters(item, { referenceNo: 'fin-0007' })).toBe(true);
    expect(correspondenceMatchesFilters(item, { referenceNo: 'HR' })).toBe(false);
    expect(correspondenceMatchesFilters(item, { subject: 'budget' })).toBe(true);
    expect(correspondenceMatchesFilters(item, { sender: 'ali' })).toBe(true);
    expect(correspondenceMatchesFilters(item, { recipient: 'carol' })).toBe(false);
    // Type / Priority match exactly.
    expect(correspondenceMatchesFilters(item, { type: 'Letter' })).toBe(true);
    expect(correspondenceMatchesFilters(item, { type: 'Memo' })).toBe(false);
    expect(correspondenceMatchesFilters(item, { priority: 'High' })).toBe(true);
    expect(correspondenceMatchesFilters(item, { priority: 'Normal' })).toBe(false);
  });
});
