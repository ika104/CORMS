import { INumberingService } from '../interfaces/INumberingService';
import { INumberingRequest, INumberingResult } from '../../models/ICorrespondenceMetadata';
import { toContentTypeCode, toFunctionCode } from './referenceCodes';

const SIMULATED_LATENCY_MS = 250;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

function pad3(n: number): string {
  const s = String(n);
  return s.length >= 3 ? s : '0'.repeat(3 - s.length) + s;
}

// Mock realism per TASK-05 §5: OQ8-<FUNC>-<DOCTYPE>-<YY>-<serial>, per-year serial reset,
// separate series per direction. In-memory only — the live series lives in the RecordsHub
// numbering list (ds.numbering) and must be atomic/shared there.
export class NumberingServiceMock implements INumberingService {
  private counters = new Map<string, number>();

  public issueReferenceNumber(request: INumberingRequest): Promise<INumberingResult> {
    if (request.threadReferenceNumber) {
      const revisionMatch = /-R(\d+)$/.exec(request.threadReferenceNumber);
      const nextRevision = revisionMatch ? Number(revisionMatch[1]) + 1 : 1;
      const base = request.threadReferenceNumber.replace(/-R\d+$/, '');
      return delay({ referenceNumber: `${base}-R${nextRevision}` });
    }

    const year = new Date().getFullYear() % 100;
    const seriesKey = `${request.direction}-${year}`;
    const nextSerial = (this.counters.get(seriesKey) ?? 0) + 1;
    this.counters.set(seriesKey, nextSerial);

    const funcCode = toFunctionCode(request.originatingFunction);
    const docCode = toContentTypeCode(request.contentType);
    return delay({ referenceNumber: `OQ8-${funcCode}-${docCode}-${year}-${pad3(nextSerial)}` });
  }
}
