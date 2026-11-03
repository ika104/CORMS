import { ISignaturePlacement } from './IApprovalChain';

/**
 * Provider-independent e-signature integration. CORMS sends a document only to Power Automate;
 * the flow communicates with the configured signing provider and returns this stable contract.
 */

/** A person who must sign, in the requested signing order. */
export interface ISignatureSigner {
  name: string;
  email: string;
  signingOrder?: number;
  /** Where this signer's signature goes: page (1-based) and box as percentages of the page. */
  placement?: ISignaturePlacement;
}

/** Everything the provider needs to raise an embedded signing request for one document. */
export interface ISendForSignatureInput {
  correspondenceId: string;
  referenceNumber: string;
  subject: string;
  /** File name (with extension) supplied to the signing flow. */
  fileName: string;
  /** The document bytes to be signed (fetched from SharePoint by the caller). */
  fileContent: Blob;
  /** One or more signers, signed in the given order. */
  signers: ISignatureSigner[];
  /** Where the provider's signing page sends the signer when they finish, decline or close, so the
   * in-app signing frame can tell that the session ended (see signingReturn.ts). */
  returnUrl?: string;
}

/** What the signing flow returns after it creates an external signing request. */
export interface ISignatureRequestResult {
  /** Opaque provider-side identifier; CORMS never depends on its format. */
  externalDocumentId: string;
  /** Flow-returned URL for the signing experience. */
  signingUrl: string;
}

/** Flow-normalized signing state used to prove that a required approval signature finished. */
export interface ISignatureStatusResult {
  externalDocumentId: string;
  /** Provider-neutral flow status for display/audit. */
  status: string;
  isCompleted: boolean;
}

/** The signed PDF the flow returns once a signing request is completed. */
export interface ISignedDocument {
  externalDocumentId: string;
  content: Blob;
}
