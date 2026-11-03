import { IContentType } from '../../models/ICorrespondenceMetadata';

/** The CORMS document library whose content types back the Create Correspondence "Content Type"
 * field — its "New" menu set (Document / Announcement / Letter, …). */
export const CONTENT_TYPES_LIST = 'CORMS_Attachments';

/** A SharePoint SP.ContentType row as returned by `.../ContentTypes` (odata=nometadata). `Id` is a
 * value type serialized as `{ StringValue }`; `StringId` is the same id as a plain string — either
 * may be present depending on $select, so both are read. */
export interface IContentTypeRow {
  Name?: string;
  Hidden?: boolean;
  StringId?: string;
  Id?: { StringValue?: string };
}

// SharePoint content type id prefixes: 0x0120 = Folder, 0x0120D5 = Document Set. Both are excluded
// so the picker offers only real document content types (the same ones the library's New menu
// lists), never the structural Folder/Document-Set entries.
const FOLDER_CONTENT_TYPE_PREFIX = '0x0120';

function contentTypeId(row: IContentTypeRow): string {
  return row.StringId ?? row.Id?.StringValue ?? '';
}

/**
 * Maps a document library's content types to the Create Correspondence field's options — dropping
 * hidden content types and the structural Folder / Document Set entries, keeping the real document
 * content types in the order SharePoint returns them (which mirrors the library's New menu).
 */
export function parseLibraryContentTypes(rows: IContentTypeRow[]): IContentType[] {
  return rows
    .filter((row) => !!row.Name && !row.Hidden && contentTypeId(row).indexOf(FOLDER_CONTENT_TYPE_PREFIX) !== 0)
    .map((row) => ({ id: contentTypeId(row) || (row.Name as string), name: row.Name as string }));
}
