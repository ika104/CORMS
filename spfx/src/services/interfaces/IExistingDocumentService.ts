import { IExistingDocItem, IExistingDocLibrary, IExistingDocSite, IExistingDocumentFile } from '../../models/IExistingDocument';

/**
 * Backs the Create Correspondence → Existing Document tab: browse the allowed SharePoint sites, their
 * document libraries and documents, and pull a chosen file in as the main correspondence document.
 * The allowed sites come from the configured RecordsHub `RH_RecordsHub` registry list;
 * every read still runs as the signed-in user, so a configured site/library they can't read returns
 * empty rather than exposing anything.
 */
export interface IExistingDocumentService {
  /** The sites the user may browse, from the configured RH_RecordsHub registry. */
  getAllowedSites(): Promise<IExistingDocSite[]>;
  /** Document libraries in the given site (visible, non-hidden). */
  getLibraries(siteUrl: string): Promise<IExistingDocLibrary[]>;
  /** Documents (files, not folders) in the given library of the given site. */
  getDocuments(siteUrl: string, libraryTitle: string): Promise<IExistingDocItem[]>;
  /** Fetches a chosen document's bytes so it can be attached as the main correspondence document. */
  getDocumentFile(siteUrl: string, serverRelativeUrl: string): Promise<IExistingDocumentFile>;
}
