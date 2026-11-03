import { IESignatureService } from '../interfaces/IESignatureService';
import {
  ISendForSignatureInput,
  ISignatureRequestResult,
  ISignatureStatusResult,
  ISignedDocument,
} from '../../models/IESignature';

const SIMULATED_LATENCY_MS = 160;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/**
 * DEV / demo e-signature flow — no external signing account needed. Returns a deterministic
 * external document ID and placeholder signing URL so the full Send-for-Signature → open-link →
 * tracked-session flow can be demonstrated end-to-end against mock data.
 */
export class ESignatureServiceMock implements IESignatureService {
  public isConfigured(): Promise<boolean> {
    return delay(true);
  }

  public sendForSignature(input: ISendForSignatureInput): Promise<ISignatureRequestResult> {
    const externalDocumentId = `mock-doc-${input.correspondenceId}-${Date.now()}`;
    return delay({
      externalDocumentId,
      // A harmless placeholder the demo shows in place of a real signing page.
      signingUrl: `https://example.com/signing-mock/${encodeURIComponent(externalDocumentId)}`,
    });
  }

  public getSignatureStatus(externalDocumentId: string): Promise<ISignatureStatusResult> {
    return delay({ externalDocumentId, status: 'Completed', isCompleted: true });
  }

  public getSignedDocument(externalDocumentId: string): Promise<ISignedDocument> {
    return delay({
      externalDocumentId,
      content: new Blob(['%PDF-1.4 mock signed document'], { type: 'application/pdf' }),
    });
  }
}
