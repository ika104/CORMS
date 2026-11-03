import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IDevSettingsService } from '../../interfaces/IDevSettingsService';
import { AuditTrailServiceLive } from '../AuditTrailService.live';
import {
  AuditFetch,
  AuditTrailServiceCore,
  buildAuditSearchBody,
  mapAuditHit,
} from '../AuditTrailServiceCore';

const FIXED_NOW = new Date('2026-09-14T10:30:00.000Z');

function response(body: unknown, status = 200, statusText = 'OK'): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  } as Response);
}

function makeFetch(): jest.MockedFunction<AuditFetch> {
  return jest.fn() as jest.MockedFunction<AuditFetch>;
}

describe('AuditTrailServiceCore — Elasticsearch audit transport', () => {
  it('writes a RecordsHub-compatible, CORMS-discriminated document and uses Elasticsearch _id', async () => {
    const fetchMock = makeFetch();
    fetchMock.mockReturnValue(response({ _id: 'es-generated-id' }, 201, 'Created'));
    const core = new AuditTrailServiceCore(
      {
        endpoint: 'https://elastic.example.test:9200/',
        apiKey: 'secret-key',
        index: 'tenant_audit',
        userName: 'Current User',
        userEmail: 'current@example.test',
        siteUrl: 'https://tenant.sharepoint.test/sites/corms',
      },
      fetchMock,
      () => FIXED_NOW
    );

    const created = await core.logEvent({
      objectId: '17',
      actor: 'caller-supplied actor',
      action: 'Correspondence Reassigned',
      details: JSON.stringify({ fromUserId: '10', toUserId: '20' }),
      timestamp: '1999-01-01T00:00:00Z',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://elastic.example.test:9200/tenant_audit/_doc', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'ApiKey secret-key',
      },
      // A numeric id populates the shared index's `long` entity_id AND the string identity fields.
      body: JSON.stringify({
        timestamp: FIXED_NOW.toISOString(),
        action: 'Correspondence Reassigned',
        application: 'CORMS',
        objectId: '17',
        entity_id_record: '17',
        entity_id: 17,
        Details: JSON.stringify({ fromUserId: '10', toUserId: '20' }),
        userName: 'Current User',
        userEmail: 'current@example.test',
        SiteUrl: 'https://tenant.sharepoint.test/sites/corms',
        category: 'correspondence',
        chainStatus: 'valid',
      }),
      mode: 'cors',
    });
    expect(created).toMatchObject({
      id: 'es-generated-id',
      seq: 0,
      objectId: '17',
      actor: 'Current User',
      timestamp: FIXED_NOW.toISOString(),
      category: 'correspondence',
    });
  });

  it('writes a non-numeric id only to the string identity fields, never the numeric entity_id', async () => {
    const fetchMock = makeFetch();
    fetchMock.mockReturnValue(response({ _id: 'es-id' }, 201, 'Created'));
    const core = new AuditTrailServiceCore(
      { endpoint: 'https://elastic.test', apiKey: 'k', siteUrl: 'https://tenant.sharepoint.test/sites/corms' },
      fetchMock,
      () => FIXED_NOW
    );

    await core.logEvent({
      objectId: 'draft-abc',
      actor: 'A',
      action: 'Viewed Tab',
      details: '',
      timestamp: '',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.objectId).toBe('draft-abc');
    expect(body.entity_id_record).toBe('draft-abc');
    expect(body).not.toHaveProperty('entity_id');
  });

  it('scopes reads by the application tag and matches an id across the string + numeric id fields', () => {
    const site = 'https://tenant.sharepoint.test/sites/corms';
    const across = (fields: string[], value: string): unknown => ({
      bool: {
        should: fields.map((field) => ({
          bool: {
            should: [{ term: { [field]: value } }, { term: { [`${field}.keyword`]: value } }],
            minimum_should_match: 1,
          },
        })),
        minimum_should_match: 1,
      },
    });

    expect(buildAuditSearchBody({ siteUrl: site, objectId: 'corr-1', action: 'Viewed Tab', limit: 25 })).toEqual({
      size: 25,
      query: {
        bool: {
          filter: [
            // Sole CORMS scope: application tag (base + .keyword), no `entity` discriminator.
            {
              bool: {
                should: [{ term: { application: 'CORMS' } }, { term: { 'application.keyword': 'CORMS' } }],
                minimum_should_match: 1,
              },
            },
            across(['SiteUrl', 'siteUrl'], site),
            // Non-numeric id: string identity fields only — no `entity_id` term (that field is a
            // numeric long and a string term would 400 the whole search).
            {
              bool: {
                should: [
                  {
                    bool: {
                      should: [{ term: { objectId: 'corr-1' } }, { term: { 'objectId.keyword': 'corr-1' } }],
                      minimum_should_match: 1,
                    },
                  },
                  {
                    bool: {
                      should: [
                        { term: { entity_id_record: 'corr-1' } },
                        { term: { 'entity_id_record.keyword': 'corr-1' } },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                ],
                minimum_should_match: 1,
              },
            },
            across(['action', 'Action'], 'Viewed Tab'),
          ],
        },
      },
      sort: [{ timestamp: { order: 'desc', missing: '_last', unmapped_type: 'date' } }],
    });
  });

  it('adds a numeric entity_id term when the object id is a whole number', () => {
    const body = buildAuditSearchBody({ objectId: '42' }) as {
      query: { bool: { filter: { bool: { should: unknown[] } }[] } };
    };
    const idClause = body.query.bool.filter[1];
    expect(idClause.bool.should).toContainEqual({ term: { entity_id: 42 } });
  });

  it('maps current and legacy hit shapes tolerantly while preserving ES _id and legacy source seq', () => {
    expect(
      mapAuditHit(
        {
          _id: 'current-id',
          _source: {
            entity_id: 'corr-2',
            userName: 'Sara',
            action: 'Delegation Created',
            Details: { delegatorId: '10' },
            timestamp: '2026-09-14T09:00:00Z',
            category: 'access',
            chainStatus: 'valid',
          },
        },
        9
      )
    ).toEqual({
      id: 'current-id',
      seq: 9,
      objectId: 'corr-2',
      actor: 'Sara',
      action: 'Delegation Created',
      details: JSON.stringify({ delegatorId: '10' }),
      timestamp: '2026-09-14T09:00:00Z',
      category: 'access',
      chainStatus: 'valid',
    });

    expect(
      mapAuditHit(
        {
          _id: 'legacy-es-id',
          _source: {
            fields: {
              Id: 82,
              ObjectId: 'legacy-object',
              Actor: { Title: 'Legacy User' },
              Action: 'Correspondence Reassigned',
              Details: '{}',
              Created: '2025-01-01T00:00:00Z',
              Category: 'CorrespondenceActions',
              ChainStatus: 'Broken',
            },
          },
        },
        1
      )
    ).toMatchObject({
      id: 'legacy-es-id',
      seq: 82,
      objectId: 'legacy-object',
      actor: 'Legacy User',
      category: 'correspondence',
      chainStatus: 'broken',
    });
  });

  it('reads POST /_search, assigns presentation rank when no legacy seq exists, and accepts a prefixed key', async () => {
    const fetchMock = makeFetch();
    fetchMock.mockReturnValue(
      response({
        hits: {
          hits: [
            { _id: 'newer', _source: { entity_id: '2', action: 'Viewed Tab', timestamp: '2026-02-02' } },
            { _id: 'older', _source: { entity_id: '1', action: 'Viewed Tab', timestamp: '2026-01-01' } },
          ],
        },
      })
    );
    const core = new AuditTrailServiceCore(
      {
        endpoint: 'https://elastic.test',
        apiKey: 'ApiKey already-prefixed',
        siteUrl: 'https://tenant.sharepoint.test/sites/corms',
      },
      fetchMock
    );

    const entries = await core.getEntries({ limit: 10 });

    expect(fetchMock.mock.calls[0][0]).toBe('https://elastic.test/sslaudit/_search');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'ApiKey already-prefixed' });
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('https://tenant.sharepoint.test/sites/corms');
    expect(entries.map(({ id, seq }) => ({ id, seq }))).toEqual([
      { id: 'newer', seq: 2 },
      { id: 'older', seq: 1 },
    ]);
  });

  it('limits reassignment lookup to its action and then safely checks structured Details', async () => {
    const fetchMock = makeFetch();
    fetchMock.mockReturnValue(
      response({
        hits: {
          hits: [
            {
              _id: 'match',
              _source: {
                entity_id: 'corr-1',
                action: 'Correspondence Reassigned',
                Details: JSON.stringify({ fromUserId: 10 }),
              },
            },
            {
              _id: 'other',
              _source: {
                entity_id: 'corr-2',
                action: 'Correspondence Reassigned',
                Details: JSON.stringify({ fromUserId: '99' }),
              },
            },
            { _id: 'bad-json', _source: { Details: 'not json' } },
          ],
        },
      })
    );
    const core = new AuditTrailServiceCore(
      {
        endpoint: 'https://elastic.test',
        apiKey: 'secret',
        siteUrl: 'https://tenant.sharepoint.test/sites/corms',
      },
      fetchMock
    );

    const entries = await core.getReassignmentsInvolving('10');
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;

    expect(JSON.stringify(requestBody)).toContain('Correspondence Reassigned');
    expect(entries.map((entry) => entry.id)).toEqual(['match']);
  });

  it('surfaces actionable errors for failed ES responses and missing endpoint configuration', async () => {
    const failedFetch = makeFetch();
    failedFetch.mockReturnValue(response({}, 401, 'Unauthorized'));

    await expect(
      new AuditTrailServiceCore(
        { endpoint: 'https://elastic.test', apiKey: 'secret' },
        failedFetch
      ).getEntries()
    ).rejects.toThrow('Elasticsearch audit search failed: 401 Unauthorized');
    await expect(new AuditTrailServiceCore({ endpoint: '' }, failedFetch).getEntries()).rejects.toThrow(
      'integration.elasticEndpoint is not configured'
    );
    await expect(
      new AuditTrailServiceCore({ endpoint: 'https://elastic.test', apiKey: '' }, failedFetch).getEntries()
    ).rejects.toThrow('integration.elasticApiKey is not configured');
  });

  it('invokes the global fetch bound to the global object (no browser "Illegal invocation")', async () => {
    // With no fetchImpl the core must fall back to globalThis.fetch AND call it bound to the
    // global object. The browser throws "Failed to execute 'fetch' on 'Window': Illegal
    // invocation" when native fetch runs with `this` set to the service instance, which is exactly
    // what `this.request(...)` did before the bind fix.
    const original = globalThis.fetch;
    let capturedThis: unknown;
    const fake = function (this: unknown): Promise<Response> {
      capturedThis = this;
      return response({ hits: { hits: [] } });
    };
    const g = globalThis as { fetch?: typeof fetch };
    g.fetch = fake as unknown as typeof fetch;
    try {
      await new AuditTrailServiceCore({ endpoint: 'https://elastic.test', apiKey: 'k' }).getEntries();
    } finally {
      g.fetch = original;
    }
    expect(capturedThis).toBe(globalThis);
  });
});

describe('AuditTrailServiceLive', () => {
  it('resolves endpoint/key/index per operation and enriches identity from SPFx context', async () => {
    const getSettings = jest
      .fn()
      .mockResolvedValueOnce([
        { key: 'integration.elasticEndpoint', value: 'https://elastic-one.test' },
        { key: 'integration.elasticApiKey', value: 'key-one' },
        { key: 'integration.elasticAuditIndex', value: 'audit-one' },
      ])
      .mockResolvedValueOnce([
        { key: 'integration.elasticEndpoint', value: 'https://elastic-two.test' },
        { key: 'integration.elasticApiKey', value: 'key-two' },
        { key: 'integration.elasticAuditIndex', value: 'audit-two' },
      ]);
    const devSettings: IDevSettingsService = { getSettings, saveSettings: jest.fn() };
    const context = {
      pageContext: {
        user: { displayName: 'Context User', email: 'context@example.test' },
        web: { absoluteUrl: 'https://tenant.sharepoint.test/sites/corms' },
      },
    } as unknown as WebPartContext;
    const fetchMock = makeFetch();
    fetchMock
      .mockReturnValueOnce(response({ hits: { hits: [] } }))
      .mockReturnValueOnce(response({ _id: 'created' }, 201));
    const service = new AuditTrailServiceLive(context, devSettings, fetchMock);

    await service.getEntries();
    await service.logEvent({ objectId: '1', actor: '', action: 'Viewed Tab', details: '', timestamp: '' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://elastic-one.test/audit-one/_search');
    expect(fetchMock.mock.calls[1][0]).toBe('https://elastic-two.test/audit-two/_doc');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      userName: 'Context User',
      userEmail: 'context@example.test',
      SiteUrl: 'https://tenant.sharepoint.test/sites/corms',
    });
  });

  it('does not write when auditing is disabled, and still returns a benign un-persisted entry', async () => {
    const getSettings = jest.fn().mockResolvedValue([
      { key: 'integration.elasticEndpoint', value: 'https://elastic.test' },
      { key: 'integration.elasticApiKey', value: 'key' },
      { key: 'integration.auditingEnabled', value: 'false' },
    ]);
    const devSettings: IDevSettingsService = { getSettings, saveSettings: jest.fn() };
    const context = {
      pageContext: {
        user: { displayName: 'Context User', email: 'context@example.test' },
        web: { absoluteUrl: 'https://tenant.sharepoint.test/sites/corms' },
      },
    } as unknown as WebPartContext;
    const fetchMock = makeFetch();
    const service = new AuditTrailServiceLive(context, devSettings, fetchMock);

    const result = await service.logEvent({
      objectId: '7',
      actor: 'A',
      action: 'Viewed Tab',
      details: 'x',
      timestamp: '2026-09-14T00:00:00.000Z',
    });

    // Nothing hit Elasticsearch...
    expect(fetchMock).not.toHaveBeenCalled();
    // ...but callers still get a well-formed (un-persisted, id-less) entry back.
    expect(result).toMatchObject({ id: '', seq: 0, objectId: '7', action: 'Viewed Tab' });
  });

  it('writes normally when auditing is enabled (explicit true)', async () => {
    const getSettings = jest.fn().mockResolvedValue([
      { key: 'integration.elasticEndpoint', value: 'https://elastic.test' },
      { key: 'integration.elasticApiKey', value: 'key' },
      { key: 'integration.auditingEnabled', value: 'true' },
    ]);
    const devSettings: IDevSettingsService = { getSettings, saveSettings: jest.fn() };
    const context = {
      pageContext: {
        user: { displayName: 'U', email: 'u@x' },
        web: { absoluteUrl: 'https://tenant.sharepoint.test/sites/corms' },
      },
    } as unknown as WebPartContext;
    const fetchMock = makeFetch();
    fetchMock.mockReturnValue(response({ _id: 'created' }, 201));
    const service = new AuditTrailServiceLive(context, devSettings, fetchMock);

    await service.logEvent({ objectId: '7', actor: 'A', action: 'Viewed Tab', details: 'x', timestamp: '' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://elastic.test/sslaudit/_doc');
  });
});
