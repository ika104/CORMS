import { ISignaturePlacement } from '../../models/IApprovalChain';
import {
  ISendForSignatureInput,
  ISignatureRequestResult,
  ISignatureStatusResult,
} from '../../models/IESignature';

/** Stable, provider-neutral contract for the Create Signing Request Power Automate flow. */
export interface ICreateSigningRequestFlowBody {
  operation: 'CreateSigningRequest';
  correspondenceId: string;
  referenceNumber: string;
  subject: string;
  document: { fileName: string; contentBase64: string };
  /** `placement` is the signature box: page (1-based) and x/y/width/height as % of the page. The
   * flow converts it to the provider's coordinates, using its own default when absent. */
  signers: Array<{ name: string; email: string; signingOrder: number; placement?: ISignaturePlacement }>;
  /** Optional. The flow sends the signer here when the signing page ends, adding
   * `signingResult=completed|declined|closed` to the query string. */
  returnUrl?: string;
}

/** Stable, provider-neutral contract for the Get Signing Status Power Automate flow. */
export interface IGetSigningStatusFlowBody {
  operation: 'GetSigningStatus';
  externalDocumentId: string;
}

/** Returns the completed document with every signature applied, as a PDF. */
export interface IGetSignedDocumentFlowBody {
  operation: 'GetSignedDocument';
  externalDocumentId: string;
}

export function buildCreateSigningRequest(
  input: Omit<ISendForSignatureInput, 'fileContent'>,
  contentBase64: string
): ICreateSigningRequestFlowBody {
  return {
    operation: 'CreateSigningRequest',
    correspondenceId: input.correspondenceId,
    referenceNumber: input.referenceNumber,
    subject: input.subject,
    document: { fileName: input.fileName, contentBase64 },
    signers: input.signers.map((signer, index) => ({
      name: signer.name,
      email: signer.email,
      signingOrder: signer.signingOrder ?? index + 1,
      ...(signer.placement ? { placement: signer.placement } : {}),
    })),
    ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
  };
}

export function buildGetSigningStatus(externalDocumentId: string): IGetSigningStatusFlowBody {
  return { operation: 'GetSigningStatus', externalDocumentId };
}

export function buildGetSignedDocument(externalDocumentId: string): IGetSignedDocumentFlowBody {
  return { operation: 'GetSignedDocument', externalDocumentId };
}

/** The signed PDF's base64 content, or undefined when the flow returned none. */
export function parseSignedDocumentResponse(json: unknown): string | undefined {
  const content = ((json ?? {}) as Record<string, unknown>).contentBase64;
  return typeof content === 'string' && content ? content : undefined;
}

/** Parses only the public flow contract; provider response shapes stay inside Power Automate. */
export function parseCreateSigningRequestResponse(json: unknown): ISignatureRequestResult | undefined {
  const body = (json ?? {}) as Record<string, unknown>;
  const externalDocumentId = body.externalDocumentId;
  const signingUrl = body.signingUrl;
  if (
    typeof externalDocumentId !== 'string' ||
    !externalDocumentId ||
    typeof signingUrl !== 'string' ||
    !signingUrl
  ) {
    return undefined;
  }
  return { externalDocumentId, signingUrl };
}

/** Completion remains flow-owned: a provider can use any status vocabulary internally. */
export function parseSigningStatusResponse(
  json: unknown,
  fallbackExternalDocumentId: string
): ISignatureStatusResult {
  const body = (json ?? {}) as Record<string, unknown>;
  const externalDocumentId = body.externalDocumentId;
  const status = body.status;
  return {
    externalDocumentId:
      typeof externalDocumentId === 'string' && externalDocumentId
        ? externalDocumentId
        : fallbackExternalDocumentId,
    status: typeof status === 'string' ? status : 'Unknown',
    isCompleted: body.isCompleted === true,
  };
}
