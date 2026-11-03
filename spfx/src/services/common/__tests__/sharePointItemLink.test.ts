import { buildSharePointItemUrl } from '../sharePointItemLink';

describe('buildSharePointItemUrl', () => {
  const origin = 'https://ssloman.sharepoint.com';

  it('builds the library AllItems.aspx view/edit URL from a server-relative attachment file', () => {
    expect(buildSharePointItemUrl(origin, '/sites/CORMS/CORMS_Attachments/10/correspondence-1.pdf')).toBe(
      'https://ssloman.sharepoint.com/sites/CORMS/CORMS_Attachments/Forms/AllItems.aspx' +
        '?id=%2Fsites%2FCORMS%2FCORMS_Attachments%2F10%2Fcorrespondence-1.pdf' +
        '&parent=%2Fsites%2FCORMS%2FCORMS_Attachments%2F10'
    );
  });

  it('handles the Year/Month/Serial folder layout', () => {
    const url = buildSharePointItemUrl(origin, '/sites/CORMS/CORMS_Attachments/2026/09/0004/main.pdf');
    expect(url).toContain('/sites/CORMS/CORMS_Attachments/Forms/AllItems.aspx?id=');
    expect(url).toContain('parent=%2Fsites%2FCORMS%2FCORMS_Attachments%2F2026%2F09%2F0004');
  });

  it('returns undefined for an absolute URL (e.g. a RecordsHub link on another site)', () => {
    expect(
      buildSharePointItemUrl(origin, 'https://ssloman.sharepoint.com/sites/Test-Extension/Shared%20Documents/x.pdf')
    ).toBeUndefined();
  });

  it('returns undefined for a path outside the attachments library, or missing inputs', () => {
    expect(buildSharePointItemUrl(origin, '/sites/CORMS/Other/file.pdf')).toBeUndefined();
    expect(buildSharePointItemUrl(origin, '')).toBeUndefined();
    expect(buildSharePointItemUrl('', '/sites/CORMS/CORMS_Attachments/10/x.pdf')).toBeUndefined();
  });
});
