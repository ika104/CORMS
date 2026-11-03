import {
  ISendForSignatureInput,
  ISignatureRequestResult,
  ISignatureStatusResult,
  ISignedDocument,
} from '../../models/IESignature';

/**
 * E-signature flow bridge. Raises a signing request through Power Automate and returns an opaque
 * external document ID and signing URL. Persisting the request as a
 * CORMS_SigningSessions row (so the Signing Dashboard tracks it) is the caller's job, via
 * ISigningService.createSession — this interface is only the flow bridge.
 */
export interface IESignatureService {
  /** True once the signing flow URL is set in Admin Config. */
  isConfigured(): Promise<boolean>;
  /** Sends the document to the create-request flow and returns the signing link to open. */
  sendForSignature(input: ISendForSignatureInput): Promise<ISignatureRequestResult>;
  /** Reads the flow-normalized external document state. A link alone must never unlock approval. */
  getSignatureStatus(externalDocumentId: string): Promise<ISignatureStatusResult>;
  /** The completed document with every signature applied, as a PDF — saved back as the
   * correspondence's main document so the next signer signs the same, already-signed file. */
  getSignedDocument(externalDocumentId: string): Promise<ISignedDocument>;
}
