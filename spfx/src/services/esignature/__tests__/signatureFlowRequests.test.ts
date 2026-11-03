import {
  buildCreateSigningRequest,
  buildGetSignedDocument,
  buildGetSigningStatus,
  parseSignedDocumentResponse,
  parseCreateSigningRequestResponse,
  parseSigningStatusResponse,
} from '../signatureFlowRequests';

describe('signature Power Automate contracts', () => {
  it('uses a generic create payload with ordered signers and base64 document content', () => {
    expect(
      buildCreateSigningRequest(
        {
          correspondenceId: 'C-1',
          referenceNumber: 'REF-1',
          subject: 'Board Resolution',
          fileName: 'doc.pdf',
          signers: [{ name: 'Omar Said', email: 'omar@example.com' }],
        },
        'QkFTRTY0'
      )
    ).toEqual({
      operation: 'CreateSigningRequest',
      correspondenceId: 'C-1',
      referenceNumber: 'REF-1',
      subject: 'Board Resolution',
      document: { fileName: 'doc.pdf', contentBase64: 'QkFTRTY0' },
      signers: [{ name: 'Omar Said', email: 'omar@example.com', signingOrder: 1 }],
    });
  });

  it('carries the return address only when one is given', () => {
    const input = {
      correspondenceId: 'C-1',
      referenceNumber: 'REF-1',
      subject: 'Board Resolution',
      fileName: 'doc.pdf',
      signers: [{ name: 'Omar Said', email: 'omar@example.com' }],
    };
    expect(buildCreateSigningRequest(input, 'QkFTRTY0')).not.toHaveProperty('returnUrl');
    expect(buildCreateSigningRequest({ ...input, returnUrl: 'https://t/return' }, 'QkFTRTY0').returnUrl).toBe(
      'https://t/return'
    );
  });

  it('uses generic external document fields for status and responses', () => {
    expect(buildGetSigningStatus('ext-4')).toEqual({
      operation: 'GetSigningStatus',
      externalDocumentId: 'ext-4',
    });
    expect(
      parseCreateSigningRequestResponse({ externalDocumentId: 'ext-1', signingUrl: 'https://sign.example/x' })
    ).toEqual({
      externalDocumentId: 'ext-1',
      signingUrl: 'https://sign.example/x',
    });
    expect(parseSigningStatusResponse({ status: 'Completed', isCompleted: true }, 'ext-2')).toEqual({
      externalDocumentId: 'ext-2',
      status: 'Completed',
      isCompleted: true,
    });
  });
});

describe('signature placement and the signed document', () => {
  it("sends each signer's box, as percentages of the page", () => {
    const placement = { page: 2, x: 40, y: 85, width: 20, height: 8 };
    const body = buildCreateSigningRequest(
      {
        correspondenceId: 'C-1',
        referenceNumber: 'REF-1',
        subject: 'Board Resolution',
        fileName: 'doc.pdf',
        signers: [{ name: 'Omar Said', email: 'omar@example.com', placement }],
      },
      'QkFTRTY0'
    );
    expect(body.signers[0].placement).toEqual(placement);
  });

  it('asks for the signed document and reads its content', () => {
    expect(buildGetSignedDocument('ext-9')).toEqual({
      operation: 'GetSignedDocument',
      externalDocumentId: 'ext-9',
    });
    expect(parseSignedDocumentResponse({ contentBase64: 'JVBERi0=' })).toBe('JVBERi0=');
    expect(parseSignedDocumentResponse({ contentBase64: '' })).toBeUndefined();
  });
});
