import { parseAllowedSites } from '../IExistingDocument';

describe('parseAllowedSites', () => {
  it('parses an array of {url, title} objects', () => {
    const json = JSON.stringify([
      { url: 'https://t.sharepoint.com/sites/Contracts', title: 'Contracts' },
      { url: 'https://t.sharepoint.com/sites/Legal', title: 'Legal' },
    ]);
    expect(parseAllowedSites(json)).toEqual([
      { url: 'https://t.sharepoint.com/sites/Contracts', title: 'Contracts' },
      { url: 'https://t.sharepoint.com/sites/Legal', title: 'Legal' },
    ]);
  });

  it('accepts bare URL strings and derives a title from the last segment', () => {
    expect(parseAllowedSites(JSON.stringify(['https://t.sharepoint.com/sites/Contracts']))).toEqual([
      { url: 'https://t.sharepoint.com/sites/Contracts', title: 'Contracts' },
    ]);
  });

  it('falls back to the last URL segment when title is blank/missing', () => {
    const json = JSON.stringify([{ url: 'https://t.sharepoint.com/sites/HR', title: '   ' }]);
    expect(parseAllowedSites(json)[0].title).toBe('HR');
  });

  it('drops entries with no usable url', () => {
    const json = JSON.stringify([{ title: 'No URL' }, { url: '' }, 'https://t.sharepoint.com/sites/Ok']);
    expect(parseAllowedSites(json)).toEqual([{ url: 'https://t.sharepoint.com/sites/Ok', title: 'Ok' }]);
  });

  it('returns [] for blank, non-array or malformed JSON', () => {
    expect(parseAllowedSites(undefined)).toEqual([]);
    expect(parseAllowedSites('')).toEqual([]);
    expect(parseAllowedSites('   ')).toEqual([]);
    expect(parseAllowedSites('{ not json')).toEqual([]);
    expect(parseAllowedSites('{"url":"x"}')).toEqual([]); // object, not array
    expect(parseAllowedSites('[]')).toEqual([]);
  });

  it('tolerates a trailing slash on the url when deriving a title', () => {
    expect(parseAllowedSites(JSON.stringify(['https://t.sharepoint.com/sites/Ops/']))[0].title).toBe('Ops');
  });
});
