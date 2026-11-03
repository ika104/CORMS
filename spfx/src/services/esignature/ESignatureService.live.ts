import { IESignatureService } from '../interfaces/IESignatureService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import {
  ISendForSignatureInput,
  ISignatureRequestResult,
  ISignatureStatusResult,
  ISignedDocument,
} from '../../models/IESignature';
import { readAdminConfigValues } from '../recordsHubConfig/recordsHubConfig';
import { ISignatureFlowConfig, resolveSignatureFlowConfig } from './signatureFlowConfig';
import {
  buildCreateSigningRequest,
  buildGetSignedDocument,
  buildGetSigningStatus,
  parseCreateSigningRequestResponse,
  parseSignedDocumentResponse,
  parseSigningStatusResponse,
} from './signatureFlowRequests';

/**
 * Provider-independent e-signature bridge. SPFx only posts stable CORMS contracts to Power
 * Automate HTTP-trigger flow; the flow owns provider endpoints, credentials, field mapping and status
 * interpretation. Replacing a signing provider therefore changes flow configuration/implementation,
 * not this client bundle.
 */
export class ESignatureServiceLive implements IESignatureService {
  constructor(private readonly devSettings: IDevSettingsService) {}

  private async config(): Promise<ISignatureFlowConfig> {
    return resolveSignatureFlowConfig(await readAdminConfigValues(this.devSettings));
  }

  public async isConfigured(): Promise<boolean> {
    const config = await this.config();
    return !!config.flowUrl;
  }

  public async sendForSignature(input: ISendForSignatureInput): Promise<ISignatureRequestResult> {
    if (!input.signers.length) throw new Error('At least one signer is required to send for signature.');
    const config = await this.config();
    if (!config.flowUrl) throw new Error(flowConfigurationError());
    const contentBase64 = await blobToBase64(input.fileContent);
    const response = await postFlow(
      config.flowUrl,
      buildCreateSigningRequest(
        {
          correspondenceId: input.correspondenceId,
          referenceNumber: input.referenceNumber,
          subject: input.subject,
          fileName: input.fileName,
          signers: input.signers,
          returnUrl: input.returnUrl,
        },
        contentBase64
      ),
      'create the signing request'
    );
    const result = parseCreateSigningRequestResponse(response);
    if (!result) throw new Error('The signing flow did not return an external document ID and signing URL.');
    return result;
  }

  public async getSignatureStatus(externalDocumentId: string): Promise<ISignatureStatusResult> {
    const config = await this.config();
    if (!config.flowUrl) throw new Error(flowConfigurationError());
    const response = await postFlow(
      config.flowUrl,
      buildGetSigningStatus(externalDocumentId),
      'read the signing status'
    );
    return parseSigningStatusResponse(response, externalDocumentId);
  }
  public async getSignedDocument(externalDocumentId: string): Promise<ISignedDocument> {
    const config = await this.config();
    if (!config.flowUrl) throw new Error(flowConfigurationError());
    const response = await postFlow(
      config.flowUrl,
      buildGetSignedDocument(externalDocumentId),
      'download the signed document'
    );
    const contentBase64 = parseSignedDocumentResponse(response);
    if (!contentBase64) throw new Error('The signing flow did not return the signed document.');
    return { externalDocumentId, content: base64ToPdfBlob(contentBase64) };
  }
}

function flowConfigurationError(): string {
  return 'Signing flow is not configured. Set signature.flowUrl in Admin Configuration.';
}

async function postFlow(url: string, body: unknown, operation: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await flowError(operation, response));
  return response.json();
}

/** Reads a Blob into base64 without a data URL prefix for the generic flow contract. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the document for signing.'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function flowError(operation: string, response: Response): Promise<string> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // The status is sufficient if the response body cannot be read.
  }
  return `Signing flow failed to ${operation}: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`;
}

function base64ToPdfBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
