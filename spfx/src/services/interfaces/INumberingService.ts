import { INumberingRequest, INumberingResult } from '../../models/ICorrespondenceMetadata';

// Backs ds.numbering (D-03) — issues the controlled reference number on Send only (CMS-004),
// never on Save Draft. Incoming/Outgoing use separate series; a thread keeps one number constant.
export interface INumberingService {
  issueReferenceNumber(request: INumberingRequest): Promise<INumberingResult>;
}
