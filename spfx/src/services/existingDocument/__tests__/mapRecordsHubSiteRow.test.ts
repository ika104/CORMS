import { mapBrowsableRecordsHubSites, mapRecordsHubSiteRow } from '../recordsHubSiteRow';

describe('mapRecordsHubSiteRow', () => {
  it('maps a real RH_RecordsHub row (RH_SiteURL / RH_SiteName / RH_SiteId)', () => {
    expect(
      mapRecordsHubSiteRow({
        Id: 12,
        RH_SiteURL: 'https://ssloman.sharepoint.com/sites/dev-node',
        RH_SiteName: 'dev-node',
        RH_SiteId: 'ssloman.sharepoint.com,1fe59b36-...,ae2ea71a-...',
      })
    ).toEqual({
      id: '12',
      siteId: 'ssloman.sharepoint.com,1fe59b36-...,ae2ea71a-...',
      url: 'https://ssloman.sharepoint.com/sites/dev-node',
      title: 'dev-node',
    });
  });

  it('derives a title from the URL when the name column is blank', () => {
    expect(
      mapRecordsHubSiteRow({ Id: 27, RH_SiteURL: 'https://ssloman.sharepoint.com/sites/Test-Extension' })
    ).toMatchObject({ url: 'https://ssloman.sharepoint.com/sites/Test-Extension', title: 'Test-Extension' });
  });

  it('drops a row without an http(s) site URL', () => {
    expect(mapRecordsHubSiteRow({ Id: 1, RH_SiteName: 'No URL' })).toBeUndefined();
    expect(mapRecordsHubSiteRow({ Id: 2, RH_SiteURL: 'not-a-url' })).toBeUndefined();
  });

  it('uses all RH_RecordsHub rows except the current CORMS site and removes duplicate URLs', () => {
    expect(
      mapBrowsableRecordsHubSites(
        [
          { RH_SiteName: 'CORMS', RH_SiteURL: 'https://ssloman.sharepoint.com/sites/CORMS/' },
          { RH_SiteName: 'Test Extension', RH_SiteURL: 'https://ssloman.sharepoint.com/sites/Test-Extension' },
          { RH_SiteName: 'Duplicate', RH_SiteURL: 'https://ssloman.sharepoint.com/sites/test-extension/' },
          { RH_SiteName: 'PDO Department', RH_SiteURL: 'https://ssloman.sharepoint.com/sites/PDODepartment' },
        ],
        'https://ssloman.sharepoint.com/sites/corms'
      )
    ).toEqual([
      { title: 'Test Extension', url: 'https://ssloman.sharepoint.com/sites/Test-Extension' },
      { title: 'PDO Department', url: 'https://ssloman.sharepoint.com/sites/PDODepartment' },
    ]);
  });
});
