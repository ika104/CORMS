import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';

// My Correspondence's backend (extends the ICorrespondenceListService pattern per the Create
// Correspondence backend task's Part 4, rather than duplicating it). Gated behind
// app.correspondenceDataSource (src/services/appDataSource) — NOT a ds.* toggle, see that
// module's file comment for why this is a deliberately separate concept.
export interface ICorrespondenceDashboardService {
  /** Clearance-trimmed, same enforcement point CorrespondenceListServiceCore already uses — one
   * implementation, not a second one. */
  getAll(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]>;
}
