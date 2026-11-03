import { parseLibraryContentTypes, IContentTypeRow } from '../contentTypes';

describe('parseLibraryContentTypes', () => {
  it('keeps real document content types and drops Folder / hidden / unnamed ones', () => {
    const rows: IContentTypeRow[] = [
      { Name: 'Document', StringId: '0x0101009ABC' },
      { Name: 'Announcement', StringId: '0x0101002DEF' },
      { Name: 'Letter', StringId: '0x0101007GHI' },
      { Name: 'Folder', StringId: '0x0120001234' },
      { Name: 'Document Set', StringId: '0x0120D5000000' },
      { Name: 'Hidden CT', StringId: '0x010100HIDDEN', Hidden: true },
      { Name: '', StringId: '0x0101000000' },
    ];
    expect(parseLibraryContentTypes(rows)).toEqual([
      { id: '0x0101009ABC', name: 'Document' },
      { id: '0x0101002DEF', name: 'Announcement' },
      { id: '0x0101007GHI', name: 'Letter' },
    ]);
  });

  it('reads the id from Id.StringValue when StringId is absent', () => {
    const rows: IContentTypeRow[] = [{ Name: 'Letter', Id: { StringValue: '0x010100AAA' } }];
    expect(parseLibraryContentTypes(rows)).toEqual([{ id: '0x010100AAA', name: 'Letter' }]);
  });

  it('falls back to the name as id when neither id form is present', () => {
    expect(parseLibraryContentTypes([{ Name: 'Letter' }])).toEqual([{ id: 'Letter', name: 'Letter' }]);
  });

  it('preserves the order SharePoint returns (mirrors the New menu)', () => {
    const rows: IContentTypeRow[] = [
      { Name: 'Letter', StringId: '0x010100C' },
      { Name: 'Document', StringId: '0x010100A' },
      { Name: 'Announcement', StringId: '0x010100B' },
    ];
    expect(parseLibraryContentTypes(rows).map((c) => c.name)).toEqual(['Letter', 'Document', 'Announcement']);
  });
});
