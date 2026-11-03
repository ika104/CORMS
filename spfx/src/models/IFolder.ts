import { CorrespondencePriority, CorrespondenceStatus } from './ICorrespondence';

/** Saved-search criteria for a custom Inbox folder (CMS-054). All fields are ANDed; an
 * unset field is ignored ("Any"). */
export interface IFolderCriteria {
  status?: CorrespondenceStatus;
  securityTier?: number;
  priority?: CorrespondencePriority;
  recordClassificationId?: string;
  sender?: string;
}

export interface IUserFolder {
  id: string;
  name: string;
  criteria: IFolderCriteria;
  /** Correspondence ids explicitly pinned into this folder — appear here even when they
   * don't match `criteria`. Pinning never removes the item from Inbox (§ CMS-054 AC). */
  manualIds: string[];
}
