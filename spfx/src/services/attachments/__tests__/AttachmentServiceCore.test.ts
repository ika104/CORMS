import { AttachmentServiceCore, IAttachmentContentSurface } from '../AttachmentServiceCore';
import { createFakeSite, createFakeSp } from '../../__tests__/testUtils/fakeSp';
import { ICreateAttachmentInput } from '../../../models/IAttachmentRecord';

const CURRENT_USER_ID = 10;

// Hand-rolled fake IAttachmentContentSurface — fakeSp.ts only models list items (see its own file
// comment), not real folder/file operations, so this surface just creates a fresh CORMS_Attachments
// list item directly through the same fake item-creation fakeSp already supports, mirroring how
// DelegationServiceCore.test.ts fakes IDelegationAttachmentUploadSurface.
function makeFakeContentSurface(sp: ReturnType<typeof createFakeSp>): IAttachmentContentSurface {
  const createItem = async (): Promise<number> => {
    const created = (await sp.web.lists.getByTitle('CORMS_Attachments').items.add({})) as { Id: number };
    return created.Id;
  };
  return { resolveItemId: createItem, uploadPlaceholder: createItem };
}

function makeCore(site: ReturnType<typeof createFakeSite>): AttachmentServiceCore {
  const sp = createFakeSp(site);
  return new AttachmentServiceCore(sp, makeFakeContentSurface(sp));
}

function baseInput(overrides: Partial<ICreateAttachmentInput> = {}): ICreateAttachmentInput {
  return {
    correspondenceId: '1',
    fileName: 'letter.pdf',
    source: 'Uploaded',
    serverRelativeUrl: '/sites/CORMS/CORMS_Attachments/letter.pdf',
    ...overrides,
  };
}

describe('Document library upload gap fix — create() never uses items.add() directly', () => {
  it('resolves the real item behind an already-uploaded serverRelativeUrl for an Uploaded source', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const sp = createFakeSp(site);
    const resolveItemId = jest.fn(async () => {
      const created = (await sp.web.lists.getByTitle('CORMS_Attachments').items.add({})) as { Id: number };
      return created.Id;
    });
    const core = new AttachmentServiceCore(sp, { resolveItemId, uploadPlaceholder: jest.fn() });

    await core.create(baseInput({ source: 'Uploaded', serverRelativeUrl: '/sites/CORMS/CORMS_Attachments/x.pdf' }));

    expect(resolveItemId).toHaveBeenCalledWith('/sites/CORMS/CORMS_Attachments/x.pdf');
  });

  it('throws for an Uploaded/Scanned source with no serverRelativeUrl, rather than silently creating a bare metadata row', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await expect(core.create(baseInput({ source: 'Uploaded', serverRelativeUrl: undefined }))).rejects.toThrow();
  });

  it('a RecordHubReference source needs no serverRelativeUrl — uploads a placeholder instead', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const sp = createFakeSp(site);
    const uploadPlaceholder = jest.fn(async () => {
      const created = (await sp.web.lists.getByTitle('CORMS_Attachments').items.add({})) as { Id: number };
      return created.Id;
    });
    const core = new AttachmentServiceCore(sp, { resolveItemId: jest.fn(), uploadPlaceholder });

    const record = await core.create(
      baseInput({ source: 'RecordHubReference', serverRelativeUrl: undefined, recordHubReferenceNumber: 'RH-500012' })
    );

    expect(uploadPlaceholder).toHaveBeenCalled();
    expect(record.source).toBe('RecordHubReference');
    expect(record.recordHubReferenceNumber).toBe('RH-500012');
  });

  it('persists the canonical RecordsHub URL selected from the site/library document browser', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    const url = 'https://ssloman.sharepoint.com/sites/Test-Extension/Shared%20Documents/contract.pdf';

    const record = await core.create(
      baseInput({ source: 'RecordHubReference', serverRelativeUrl: undefined, recordHubReferenceUrl: url })
    );

    expect(record.recordHubReferenceUrl).toBe(url);
    expect((await core.list('1')).find((row) => row.id === record.id)?.recordHubReferenceUrl).toBe(url);
  });

  it('a Core constructed without a content surface (read-only consumers like CorrespondenceDetailServiceCore) throws on create()', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = new AttachmentServiceCore(createFakeSp(site));

    await expect(core.create(baseInput())).rejects.toThrow();
  });
});

describe('CMS-001/CMS-002 — AttachmentServiceCore', () => {
  it('create persists a metadata row linked by CorrespondenceId', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const record = await core.create(baseInput({ correspondenceId: '42', fileName: 'scan.tiff', source: 'Scanned' }));

    expect(record.correspondenceId).toBe('42');
    expect(record.fileName).toBe('scan.tiff');
    expect(record.source).toBe('Scanned');
    expect(record.isMainLetter).toBe(false);
  });

  it('CMS-034 AC6/AC7: create persists and list reads back the per-attachment securityTier', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const record = await core.create(baseInput({ correspondenceId: '7', fileName: 'classified.pdf', securityTier: 4 }));

    expect(record.securityTier).toBe(4);
    const rows = await core.list('7');
    expect(rows.find((r) => r.id === record.id)?.securityTier).toBe(4);
  });

  it('list returns only attachments linked to the given correspondence', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    await core.create(baseInput({ correspondenceId: '1' }));
    await core.create(baseInput({ correspondenceId: '2' }));
    await core.create(baseInput({ correspondenceId: '1' }));

    const rows = await core.list('1');

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.correspondenceId === '1')).toBe(true);
  });

  it('AC6/AC7: defaultMainLetterIfNone flags the earliest attachment when none is already flagged', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    const first = await core.create(baseInput({ correspondenceId: '1', fileName: 'first.pdf' }));
    await core.create(baseInput({ correspondenceId: '1', fileName: 'second.pdf' }));

    await core.defaultMainLetterIfNone('1');

    const rows = await core.list('1');
    const main = rows.find((r) => r.isMainLetter);
    expect(main?.id).toBe(first.id);
  });

  it('defaultMainLetterIfNone leaves an explicitly-flagged main letter untouched', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    await core.create(baseInput({ correspondenceId: '1', fileName: 'first.pdf' }));
    const second = await core.create(baseInput({ correspondenceId: '1', fileName: 'second.pdf' }));
    await core.setMainLetter('1', second.id);

    await core.defaultMainLetterIfNone('1');

    const rows = await core.list('1');
    const flagged = rows.filter((r) => r.isMainLetter);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].id).toBe(second.id);
  });

  it('setMainLetter ensures exactly one main letter per correspondence', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    const first = await core.create(baseInput({ correspondenceId: '1', fileName: 'first.pdf' }));
    const second = await core.create(baseInput({ correspondenceId: '1', fileName: 'second.pdf' }));
    await core.setMainLetter('1', first.id);

    await core.setMainLetter('1', second.id);

    const rows = await core.list('1');
    expect(rows.filter((r) => r.isMainLetter)).toHaveLength(1);
    expect(rows.find((r) => r.id === second.id)?.isMainLetter).toBe(true);
    expect(rows.find((r) => r.id === first.id)?.isMainLetter).toBe(false);
  });

  it('remove deletes the attachment row', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    const record = await core.create(baseInput({ correspondenceId: '1' }));

    await core.remove(record.id);

    expect(await core.list('1')).toHaveLength(0);
  });

  // Regression: on a tenant that hasn't re-run Provision Lists since RecordHubReferenceUrl was
  // added, $select naming it 400s the whole query, which used to leave getAttachments with no rows
  // and a dead Preview / Annotate tab. list() must retry without the additive column and still
  // return the attachments.
  it('falls back to the base columns when the additive RecordHubReferenceUrl column is not provisioned', async () => {
    const rows = [{ Id: 5, CorrespondenceId: '9', FileName: 'main.pdf', IsMainLetter: true, Source: 'Uploaded' }];
    const makeItems = (): unknown => {
      let selected: string[] = [];
      const run = (): Promise<unknown> =>
        selected.indexOf('RecordHubReferenceUrl') !== -1
          ? Promise.reject(new Error("The field or property 'RecordHubReferenceUrl' does not exist."))
          : Promise.resolve(rows);
      const q = Object.assign(run, {
        filter: () => q,
        select: (...fields: string[]) => {
          selected = fields;
          return q;
        },
      });
      return q;
    };
    const sp = { web: { lists: { getByTitle: () => ({ items: makeItems() }) } } } as never;
    const core = new AttachmentServiceCore(sp);

    const result = await core.list('9');

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('main.pdf');
    expect(result[0].isMainLetter).toBe(true);
  });

  it('CMS-002 AC8: recordQualityOverride persists all four override fields', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    const scanned = await core.create(baseInput({ source: 'Scanned', scannedDPI: 150 }));

    await core.recordQualityOverride(scanned.id, 'Original document unavailable in higher resolution');

    const rows = await core.list(scanned.correspondenceId);
    const row = rows.find((r) => r.id === scanned.id);
    expect(row?.isQualityOverridden).toBe(true);
    expect(row?.qualityOverrideReason).toBe('Original document unavailable in higher resolution');
    expect(row?.qualityOverriddenAt).toBeDefined();
    expect(site.lists.CORMS_Attachments.items.find((i) => i.Id === Number(scanned.id))?.QualityOverriddenById).toBe(
      CURRENT_USER_ID
    );
  });
});
