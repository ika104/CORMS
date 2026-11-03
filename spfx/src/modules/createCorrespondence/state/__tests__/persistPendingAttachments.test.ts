import { IPersistAttachmentsServices, persistPendingAttachments } from '../persistPendingAttachments';
import { createInitialFormState, ICreateCorrespondenceFormState, ISupportingDocument, IPhysicalAttachment } from '../types';

/** Narrow hand-written stubs for the three services this orchestration touches — same DI-by-
 * argument style AttachmentStorageServiceCore.test.ts's IFolderFileSurface fake uses, rather than
 * a full fakeSp site (none of these calls need one). */
function makeServices(): IPersistAttachmentsServices & { calls: string[] } {
  const calls: string[] = [];
  let nextAttachmentId = 1;
  return {
    calls,
    attachmentService: {
      create: jest.fn(async (input) => {
        calls.push(`attachment.create:${input.fileName}:${input.source}`);
        return { id: String(nextAttachmentId++), isMainLetter: false, ...input };
      }),
      list: jest.fn(),
      setMainLetter: jest.fn(),
      defaultMainLetterIfNone: jest.fn(),
      recordQualityOverride: jest.fn(async (attachmentId: string, reason: string) => {
        calls.push(`recordQualityOverride:${attachmentId}:${reason}`);
      }),
      remove: jest.fn(),
    } as unknown as IPersistAttachmentsServices['attachmentService'],
    physicalAttachmentService: {
      create: jest.fn(async (input) => {
        calls.push(`physical.create:${input.storageLocation}`);
        return { id: '1', resourceIdentifier: 'PHY-2026-0001', ...input };
      }),
      getByCorrespondence: jest.fn(),
      search: jest.fn(),
    } as unknown as IPersistAttachmentsServices['physicalAttachmentService'],
    attachmentStorageService: {
      uploadFile: jest.fn(async (correspondenceId: string, fileName: string) => {
        calls.push(`upload:${correspondenceId}:${fileName}`);
        return { fileName, serverRelativeUrl: `/CORMS_Attachments/${correspondenceId}/${fileName}` };
      }),
      listFiles: jest.fn(),
    } as unknown as IPersistAttachmentsServices['attachmentStorageService'],
  };
}

function baseState(overrides: Partial<ICreateCorrespondenceFormState> = {}): ICreateCorrespondenceFormState {
  return { ...createInitialFormState('Alice'), ...overrides };
}

describe('CMS-001/CMS-002 — persistPendingAttachments (upload-at-submit-time)', () => {
  it('uploads the pending main document, marks it main, and reports it persisted', async () => {
    const services = makeServices();
    const state = baseState({
      pendingMainDocument: { fileName: 'letter.pdf', content: new Blob(['x']), source: 'Uploaded' },
    });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.mainDocumentPersisted).toBe(true);
    expect(services.calls).toEqual(['upload:42:letter.pdf', 'attachment.create:letter.pdf:Uploaded']);
    expect(services.attachmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({ correspondenceId: '42', fileName: 'letter.pdf', isMainLetter: true })
    );
  });

  it('applies a scan quality override reason to the main document after it is created', async () => {
    const services = makeServices();
    const state = baseState({
      pendingMainDocument: {
        fileName: 'scan.tiff',
        content: new Blob(['x']),
        source: 'Scanned',
        scannedDPI: 120,
        qualityOverrideReason: 'Original unavailable in higher resolution',
      },
    });

    await persistPendingAttachments(services, state, '42');

    expect(services.attachmentService.recordQualityOverride).toHaveBeenCalledWith(
      '1',
      'Original unavailable in higher resolution'
    );
  });

  it('reports mainDocumentPersisted:false and uploads nothing when there is no pending main document', async () => {
    const services = makeServices();
    const state = baseState();

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.mainDocumentPersisted).toBe(false);
    expect(services.attachmentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads a pending "upload" supporting document and stamps its returned attachmentId', async () => {
    const services = makeServices();
    const pending: ISupportingDocument = {
      id: 'doc-1',
      name: 'annex.pdf',
      source: 'upload',
      pending: { content: new Blob(['x']), source: 'Uploaded' },
    };
    const state = baseState({ supportingDocuments: [pending] });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.supportingDocuments).toHaveLength(1);
    expect(result.supportingDocuments[0].attachmentId).toBeDefined();
    expect(result.supportingDocuments[0].pending).toBeUndefined();
    expect(services.calls).toContain('upload:42:annex.pdf');
  });

  it('records a scanned supporting document as Scanned, not Uploaded', async () => {
    const services = makeServices();
    const pending: ISupportingDocument = {
      id: 'doc-1',
      name: 'annex-scan.tiff',
      source: 'upload',
      pending: { content: new Blob(['x']), source: 'Scanned', scannedDPI: 300, qualityOverrideReason: 'Best available' },
    };
    const state = baseState({ supportingDocuments: [pending] });

    await persistPendingAttachments(services, state, '42');

    expect(services.attachmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'annex-scan.tiff', source: 'Scanned', scannedDPI: 300 })
    );
    expect(services.attachmentService.recordQualityOverride).toHaveBeenCalledWith('1', 'Best available');
  });

  it('creates a RecordHubReference supporting document with no file upload at all', async () => {
    const services = makeServices();
    const pending: ISupportingDocument = { id: 'doc-1', name: 'RH Doc', source: 'recordhub-reference', recordNumber: 'RH-500012' };
    const state = baseState({ supportingDocuments: [pending] });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.supportingDocuments[0].attachmentId).toBeDefined();
    expect(services.attachmentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(services.attachmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'RecordHubReference', recordHubReferenceNumber: 'RH-500012' })
    );
  });

  it('a supporting document already persisted in an earlier save this session is skipped, not re-uploaded', async () => {
    const services = makeServices();
    const alreadyPersisted: ISupportingDocument = { id: 'doc-1', name: 'annex.pdf', source: 'upload', attachmentId: 'existing-99' };
    const state = baseState({ supportingDocuments: [alreadyPersisted] });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.supportingDocuments).toEqual([alreadyPersisted]);
    expect(services.attachmentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(services.attachmentService.create).not.toHaveBeenCalled();
  });

  it('persists a pending physical attachment and stamps its server-generated resourceId', async () => {
    const services = makeServices();
    const pending: IPhysicalAttachment = { id: 'phy-1', description: 'Signed original', storageLocation: 'Shelf A' };
    const state = baseState({ physicalAttachments: [pending] });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.physicalAttachments[0].resourceId).toBe('PHY-2026-0001');
    expect(services.calls).toContain('physical.create:Shelf A');
  });

  it('a physical attachment already persisted in an earlier save this session is skipped', async () => {
    const services = makeServices();
    const alreadyPersisted: IPhysicalAttachment = { id: 'phy-1', description: 'x', storageLocation: 'A', resourceId: 'PHY-2026-0001' };
    const state = baseState({ physicalAttachments: [alreadyPersisted] });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.physicalAttachments).toEqual([alreadyPersisted]);
    expect(services.physicalAttachmentService.create).not.toHaveBeenCalled();
  });

  // CMS-034 AC6/AC7 — per-attachment classification: inherit the parent's tier by default, honour
  // an explicit per-attachment override, applied independently to each attachment row.
  describe('CMS-034 — per-attachment security classification', () => {
    it('inherits the parent correspondence securityTier when an attachment has no override', async () => {
      const services = makeServices();
      const state = baseState({
        securityTier: 3,
        pendingMainDocument: { fileName: 'main.pdf', content: new Blob(['x']), source: 'Uploaded' },
        supportingDocuments: [
          { id: 'doc-1', name: 'annex.pdf', source: 'upload', pending: { content: new Blob(['y']), source: 'Uploaded' } },
          { id: 'doc-2', name: 'RH Doc', source: 'recordhub-reference', recordNumber: 'RH-1' },
        ],
      });

      await persistPendingAttachments(services, state, '42');

      expect(services.attachmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'main.pdf', securityTier: 3 })
      );
      expect(services.attachmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'annex.pdf', securityTier: 3 })
      );
      expect(services.attachmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'RecordHubReference', securityTier: 3 })
      );
    });

    it('honours a per-attachment override up or down, independent of the parent tier', async () => {
      const services = makeServices();
      const state = baseState({
        securityTier: 3,
        // Main document overridden UP to 4; supporting reference overridden DOWN to 1.
        pendingMainDocument: { fileName: 'main.pdf', content: new Blob(['x']), source: 'Uploaded', securityTier: 4 },
        supportingDocuments: [{ id: 'doc-2', name: 'RH Doc', source: 'recordhub-reference', recordNumber: 'RH-1', securityTier: 1 }],
      });

      await persistPendingAttachments(services, state, '42');

      expect(services.attachmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'main.pdf', securityTier: 4 })
      );
      expect(services.attachmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'RecordHubReference', securityTier: 1 })
      );
    });
  });

  it('handles a full mix (main document + upload + recordhub-reference + physical) in one call', async () => {
    const services = makeServices();
    const state = baseState({
      pendingMainDocument: { fileName: 'main.pdf', content: new Blob(['x']), source: 'Uploaded' },
      supportingDocuments: [
        { id: 'doc-1', name: 'annex.pdf', source: 'upload', pending: { content: new Blob(['y']), source: 'Uploaded' } },
        { id: 'doc-2', name: 'RH Doc', source: 'recordhub-reference', recordNumber: 'RH-1' },
      ],
      physicalAttachments: [{ id: 'phy-1', description: 'x', storageLocation: 'A' }],
    });

    const result = await persistPendingAttachments(services, state, '42');

    expect(result.mainDocumentPersisted).toBe(true);
    expect(result.supportingDocuments.every((d) => !!d.attachmentId)).toBe(true);
    expect(result.physicalAttachments[0].resourceId).toBeDefined();
  });
});
