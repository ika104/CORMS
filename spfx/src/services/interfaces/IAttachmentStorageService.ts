import { IStoredFile } from '../attachments/AttachmentStorageServiceCore';

// The binary-file half of attachment storage (CMS-002 AC3) — see AttachmentStorageServiceCore's
// file comment. Always live, no ds.* toggle.
export interface IAttachmentStorageService {
  uploadFile(folderPath: string, fileName: string, content: Blob | ArrayBuffer): Promise<IStoredFile>;
  listFiles(folderPath: string): Promise<IStoredFile[]>;
}
