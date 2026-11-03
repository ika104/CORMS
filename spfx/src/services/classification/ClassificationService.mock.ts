import { IApplyClassificationInput, IClassificationService } from '../interfaces/IClassificationService';

/** Mock (session) classify/amend — a no-op that resolves, mirroring RoutingServiceMock. In mock
 * mode the triage screen's optimistic local draft is the source of truth; nothing is persisted. */
export class ClassificationServiceMock implements IClassificationService {
  public applyClassification(_input: IApplyClassificationInput): Promise<void> {
    return Promise.resolve();
  }
}
