import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';

/** Real, server-side-filtered Inbox/Sent/Drafts queries against CORMS_Correspondence (CMS-039).
 * Always live, no ds.* toggle — CORMS owns this data outright. Every method applies clearance
 * trimming (AC8) in addition to whatever `filters` the caller passed — see
 * src/services/common/clearance.ts for the shared enforcement helper and its caveats. */
export interface ICorrespondenceListService {
  /** Direction = Incoming, routed/assigned to the current user (AssignedTo eq currentUser). */
  getInbox(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]>;
  /** Direction = Outgoing AND Status != Draft. */
  getSent(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]>;
  /** Status = Draft AND Author (Sender) = current user. */
  getDrafts(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]>;
}
