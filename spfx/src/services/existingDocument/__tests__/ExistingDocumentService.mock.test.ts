import { ExistingDocumentServiceMock } from '../ExistingDocumentService.mock';

describe('ExistingDocumentServiceMock', () => {
  const svc = new ExistingDocumentServiceMock();

  it('lists sites, then libraries for a site, then documents for a library (the drill-down)', async () => {
    const sites = await svc.getAllowedSites();
    expect(sites.length).toBeGreaterThan(0);

    const libraries = await svc.getLibraries(sites[0].url);
    expect(libraries.length).toBeGreaterThan(0);

    const documents = await svc.getDocuments(sites[0].url, libraries[0].title);
    expect(documents.length).toBeGreaterThan(0);
    expect(documents[0].serverRelativeUrl).toBeTruthy();
  });

  it('returns an empty list for an unknown site or library rather than throwing', async () => {
    expect(await svc.getLibraries('https://unknown')).toEqual([]);
    expect(await svc.getDocuments('https://unknown', 'Nope')).toEqual([]);
  });

  it('fetches a document file as a named Blob', async () => {
    const file = await svc.getDocumentFile('https://x', '/sites/Contracts/Shared Documents/NDA Template.docx');
    expect(file.fileName).toBe('NDA Template.docx');
    expect(file.content).toBeInstanceOf(Blob);
    expect(file.content.size).toBeGreaterThan(0);
  });
});
