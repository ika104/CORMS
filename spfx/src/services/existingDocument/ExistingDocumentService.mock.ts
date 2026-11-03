import { IExistingDocumentService } from '../interfaces/IExistingDocumentService';
import {
  IExistingDocItem,
  IExistingDocLibrary,
  IExistingDocSite,
  IExistingDocumentFile,
} from '../../models/IExistingDocument';

const SIMULATED_LATENCY_MS = 200;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// Dev/jsdom stand-in so the Existing Document picker is fully explorable without SharePoint. Two
// sites, each with a couple of libraries, each with a few documents; getDocumentFile returns a tiny
// real Blob so the chosen document behaves like a picked file in the compose section.
const SITES: IExistingDocSite[] = [
  { url: 'https://contoso.sharepoint.com/sites/Contracts', title: 'Contracts' },
  { url: 'https://contoso.sharepoint.com/sites/Legal', title: 'Legal Affairs' },
];

const LIBRARIES: Record<string, IExistingDocLibrary[]> = {
  'https://contoso.sharepoint.com/sites/Contracts': [
    { id: '1', title: 'Documents', serverRelativeUrl: '/sites/Contracts/Shared Documents' },
    { id: '2', title: 'Signed Agreements', serverRelativeUrl: '/sites/Contracts/Signed Agreements' },
  ],
  'https://contoso.sharepoint.com/sites/Legal': [
    { id: '1', title: 'Documents', serverRelativeUrl: '/sites/Legal/Shared Documents' },
  ],
};

const DOCUMENTS: Record<string, IExistingDocItem[]> = {
  'Documents': [
    { name: 'Master Services Agreement.pdf', serverRelativeUrl: '/sites/Contracts/Shared Documents/Master Services Agreement.pdf', sizeBytes: 248000, modified: '2026-02-11T09:14:00Z' },
    { name: 'NDA Template.docx', serverRelativeUrl: '/sites/Contracts/Shared Documents/NDA Template.docx', sizeBytes: 38000, modified: '2026-01-30T13:02:00Z' },
  ],
  'Signed Agreements': [
    { name: 'Vendor Agreement - Aramex (signed).pdf', serverRelativeUrl: '/sites/Contracts/Signed Agreements/Vendor Agreement - Aramex (signed).pdf', sizeBytes: 512000, modified: '2026-02-20T08:00:00Z' },
  ],
};

export class ExistingDocumentServiceMock implements IExistingDocumentService {
  public getAllowedSites(): Promise<IExistingDocSite[]> {
    return delay(SITES);
  }

  public getLibraries(siteUrl: string): Promise<IExistingDocLibrary[]> {
    return delay(LIBRARIES[siteUrl] ?? []);
  }

  public getDocuments(_siteUrl: string, libraryTitle: string): Promise<IExistingDocItem[]> {
    return delay(DOCUMENTS[libraryTitle] ?? []);
  }

  public getDocumentFile(_siteUrl: string, serverRelativeUrl: string): Promise<IExistingDocumentFile> {
    const fileName = serverRelativeUrl.slice(serverRelativeUrl.lastIndexOf('/') + 1);
    const content = new Blob([`Mock content for ${fileName}`], { type: 'application/octet-stream' });
    return delay({ fileName, content });
  }
}
