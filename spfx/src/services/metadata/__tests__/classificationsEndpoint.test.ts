import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { IDevSettingsService } from '../../interfaces/IDevSettingsService';

jest.mock('@microsoft/sp-http', () => ({
  SPHttpClient: { configurations: { v1: {} } },
}));

import { MetadataServiceLive, resolveClassificationsEndpoint } from '../MetadataService.live';

describe('resolveClassificationsEndpoint', () => {
  it('prefers the explicitly configured classifications list URL (how the customer tenant is set up)', () => {
    // recordsHubSiteUrl is blank on the customer's tenant; the RH_Classifications list is pointed to
    // by its own AllItems.aspx URL, exactly like RH_SecurityLevels and RH_OrgSecurity. That explicit
    // value must win so the picker fetches from RecordsHub instead of failing on the empty base URL.
    expect(
      resolveClassificationsEndpoint({
        recordsHubSiteUrl: '',
        'recordsHub.classificationsListUrl':
          'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/Lists/RH_Classifications/AllItems.aspx?viewid=abc-123',
      })
    ).toEqual({
      webUrl: 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2',
      listServerRelativeUrl: '/sites/SPEDRMSRecordsHubDev2/Lists/RH_Classifications',
    });
  });

  it('falls back to the conventional path under recordsHubSiteUrl when no explicit URL is set', () => {
    expect(
      resolveClassificationsEndpoint({
        recordsHubSiteUrl: 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/',
      })
    ).toEqual({
      webUrl: 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2',
      listServerRelativeUrl: '/sites/SPEDRMSRecordsHubDev2/Lists/RH_Classifications',
    });
  });

  it('is undefined only when neither the explicit URL nor a base site URL is configured', () => {
    expect(resolveClassificationsEndpoint({ recordsHubSiteUrl: '  ' })).toBeUndefined();
    expect(resolveClassificationsEndpoint({})).toBeUndefined();
  });

  it('maps RH_Aggregations rows to RH_Number + English Title, carrying the Arabic name separately', async () => {
    const get = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            { Id: 420, Title: 'AggDeploy0001', RH_Number: '2110/1-2026', RH_ArabicName: 'ملف النشر' },
            { Id: 421, Title: 'TestAgg', RH_Number: '1111/1-2026', RH_ArabicName: 'اختبار' },
          ],
        }),
    });
    const context = {
      spHttpClient: { get },
      pageContext: { web: { absoluteUrl: 'https://ssloman.sharepoint.com/sites/CORMS' } },
    } as unknown as WebPartContext;
    const devSettings: IDevSettingsService = {
      getSettings: () =>
        Promise.resolve([
          {
            key: 'recordsHub.classificationsListUrl',
            value:
              'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/Lists/RH_Aggregations/AllItems.aspx?viewid=abc',
          },
        ]),
      saveSettings: () => Promise.resolve(),
    };

    const service = new MetadataServiceLive(context, devSettings, 'https://ssloman.sharepoint.com/sites/CORMS');

    await expect(service.getRecordClassifications()).resolves.toEqual([
      { id: '420', recordNumber: '2110/1-2026', name: 'AggDeploy0001', nameAr: 'ملف النشر', active: true, clearanceTier: undefined },
      { id: '421', recordNumber: '1111/1-2026', name: 'TestAgg', nameAr: 'اختبار', active: true, clearanceTier: undefined },
    ]);
    // A single broad fetch against the RH_Aggregations list — no $expand.
    expect(get).toHaveBeenCalledWith(
      "https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/_api/web/getList('/sites/SPEDRMSRecordsHubDev2/Lists/RH_Aggregations')/items?$top=2000",
      expect.anything(),
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
  });
});
