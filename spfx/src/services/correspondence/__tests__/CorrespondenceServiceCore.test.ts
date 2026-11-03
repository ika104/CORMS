import { CorrespondenceServiceCore } from '../CorrespondenceServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';
import {
  CorrespondenceValidationError,
  ICreateCorrespondencePayload,
} from '../../../models/ICorrespondencePayload';
import { INumberingService } from '../../interfaces/INumberingService';

const CURRENT_USER_ID = 10;

function basePayload(overrides: Partial<ICreateCorrespondencePayload> = {}): ICreateCorrespondencePayload {
  return {
    subject: 'Test subject',
    direction: 'Incoming',
    priority: 'Normal',
    contentType: 'Letter',
    destinationType: 'Internal',
    destinationDepartments: ['Finance'],
    externalOrganizations: [],
    sender: 'Alice',
    recipient: 'Bob',
    securityTier: 2,
    deliveryEmail: true,
    deliveryPhysicalMail: false,
    ...overrides,
  };
}

function makeNumberingStub(referenceNumber = 'OQ8-OPS-LTR-26-0001'): INumberingService {
  return { issueReferenceNumber: jest.fn().mockResolvedValue({ referenceNumber }) };
}

function makeCore(
  site: ReturnType<typeof createFakeSite>,
  numbering = makeNumberingStub()
): CorrespondenceServiceCore {
  return new CorrespondenceServiceCore(createFakeSp(site), numbering);
}

describe('CMS-001 — CorrespondenceServiceCore.create', () => {
  it('draft mode: no reference number assigned, Status stays Draft', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const numbering = makeNumberingStub();
    const core = makeCore(site, numbering);

    const result = await core.create(basePayload(), 'draft');

    expect(result.status).toBe('Draft');
    expect(result.referenceNumber).toBeUndefined();
    expect(numbering.issueReferenceNumber).not.toHaveBeenCalled();
    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.Status).toBe('Draft');
    expect(row.ReferenceNo).toBe('');
  });

  it('submit mode: a reference number is issued via ds.numbering and Status becomes Registered', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const numbering = makeNumberingStub('OQ8-OPS-LTR-26-0007');
    const core = makeCore(site, numbering);

    const result = await core.create(basePayload(), 'submit');

    expect(result.status).toBe('Registered');
    expect(result.referenceNumber).toBe('OQ8-OPS-LTR-26-0007');
    expect(numbering.issueReferenceNumber).toHaveBeenCalledTimes(1);
    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.Status).toBe('Registered');
    expect(row.ReferenceNo).toBe('OQ8-OPS-LTR-26-0007');
  });

  it('submit mode: an Outgoing document marked already signed is filed as Signed', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const result = await core.create(
      basePayload({ direction: 'Outgoing', mainDocumentSigned: true }),
      'submit'
    );

    expect(result.status).toBe('Signed');
    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.Status).toBe('Signed');
    expect(row.MainDocumentSigned).toBe(true);
  });

  it('CMS-022: a new submitted item starts its own chain — ThreadId equals the issued reference number', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site, makeNumberingStub('OQ8-OPS-LTR-26-0009'));

    await core.create(basePayload(), 'submit');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.ReferenceNo).toBe('OQ8-OPS-LTR-26-0009');
    expect(row.ThreadId).toBe('OQ8-OPS-LTR-26-0009');
    expect(row.ParentReplyToId).toBe('');
  });

  it('CMS-022 AC1/AC4: a submitted reply inherits the chain, reuses its controlled number, and issues no new number', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const numbering = makeNumberingStub();
    const core = makeCore(site, numbering);

    await core.create(basePayload({ chainId: 'OQ8-OPS-LTR-26-0001', parentId: '5' }), 'submit');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.ThreadId).toBe('OQ8-OPS-LTR-26-0001');
    expect(row.ReferenceNo).toBe('OQ8-OPS-LTR-26-0001'); // one controlled number, held constant
    expect(row.ParentReplyToId).toBe('5');
    expect(numbering.issueReferenceNumber).not.toHaveBeenCalled();
  });

  it('CMS-022 AC7: submitting a linked reply clears the parent pending-response flag and backfills its ThreadId', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [
      { Id: 5, Title: 'Parent', ReferenceNo: 'OQ8-OPS-LTR-26-0001', ThreadId: '', PendingResponse: true },
    ]);
    const core = makeCore(site);

    await core.create(basePayload({ chainId: 'OQ8-OPS-LTR-26-0001', parentId: '5' }), 'submit');

    const parent = site.lists.CORMS_Correspondence.items.find((r) => r.Id === 5);
    expect(parent?.PendingResponse).toBe(false);
    expect(parent?.ThreadId).toBe('OQ8-OPS-LTR-26-0001');
  });

  it('CMS-022: a drafted reply records its chain/parent but consumes no number', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const numbering = makeNumberingStub();
    const core = makeCore(site, numbering);

    await core.create(basePayload({ chainId: 'OQ8-OPS-LTR-26-0001', parentId: '5' }), 'draft');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.ThreadId).toBe('OQ8-OPS-LTR-26-0001');
    expect(row.ParentReplyToId).toBe('5');
    expect(row.ReferenceNo).toBe('');
    expect(numbering.issueReferenceNumber).not.toHaveBeenCalled();
  });

  it('CMS-022 AC7: setPendingResponse persists the flag on the item', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [{ Id: 7, Title: 'Item', PendingResponse: false }]);
    const core = makeCore(site);

    await core.setPendingResponse('7', true);

    expect(site.lists.CORMS_Correspondence.items.find((r) => r.Id === 7)?.PendingResponse).toBe(true);
  });

  it('CMS-014 AC4: flagging persists the awaited party + flag time; clearing blanks them', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_Correspondence', [{ Id: 7, Title: 'Item', PendingResponse: false }]);
    const core = makeCore(site);

    await core.setPendingResponse('7', true, {
      awaitedParty: { name: 'Ministry X', type: 'External' },
      actor: 'Alya',
    });
    let row = site.lists.CORMS_Correspondence.items.find((r) => r.Id === 7)!;
    expect(row.PendingResponse).toBe(true);
    expect(row.PendingResponseParty).toBe('Ministry X');
    expect(row.PendingResponsePartyType).toBe('External');
    expect(row.PendingResponseFlaggedBy).toBe('Alya');
    expect(typeof row.PendingResponseFlaggedAt).toBe('string'); // stamped for the AC4 deadline

    await core.setPendingResponse('7', false);
    row = site.lists.CORMS_Correspondence.items.find((r) => r.Id === 7)!;
    expect(row.PendingResponse).toBe(false);
    expect(row.PendingResponseParty).toBe('');
    expect(row.PendingResponseFlaggedAt).toBeNull();
  });

  it('submit mode rejects a payload missing AC4-mandatory fields', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await expect(
      core.create(basePayload({ subject: '', sender: '', securityTier: undefined }), 'submit')
    ).rejects.toBeInstanceOf(CorrespondenceValidationError);
  });

  it('submit mode rejects an empty Internal destination', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await expect(
      core.create(basePayload({ destinationType: 'Internal', destinationDepartments: [] }), 'submit')
    ).rejects.toBeInstanceOf(CorrespondenceValidationError);
  });

  it('submit mode rejects an empty External destination', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await expect(
      core.create(
        basePayload({ destinationType: 'External', externalOrganizations: [], destinationDepartments: [] }),
        'submit'
      )
    ).rejects.toBeInstanceOf(CorrespondenceValidationError);
  });

  it('draft mode allows an empty destination', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const result = await core.create(
      basePayload({ destinationType: 'Internal', destinationDepartments: [] }),
      'draft'
    );

    expect(result.status).toBe('Draft');
  });

  it('AC9: ContentTypeName and CorrespondenceType persist independently, never collapsed', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await core.create(basePayload({ direction: 'Outgoing', contentType: 'Memo' }), 'draft');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.ContentTypeName).toBe('Memo');
    expect(row.CorrespondenceType).toBe('Outgoing');
    expect(row.ContentTypeName).not.toBe(row.CorrespondenceType);
  });

  it('never writes a bare "ContentType" key — it collides with SharePoint\'s built-in content-type navigation property and real-tenant writes reject it with an OData error (found via manual testing)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await core.create(basePayload({ contentType: 'Letter' }), 'draft');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(Object.prototype.hasOwnProperty.call(row, 'ContentType')).toBe(false);
    expect(row.ContentTypeName).toBe('Letter');
  });

  it('AC3 defense-in-depth: rejects a template reference on an Incoming payload', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await expect(
      core.create(basePayload({ direction: 'Incoming', templateReference: 'tpl-1' }), 'draft')
    ).rejects.toBeInstanceOf(CorrespondenceValidationError);
    expect(site.lists.CORMS_Correspondence?.items ?? []).toHaveLength(0);
  });

  it('CMS-037 AC4: persists TemplateReference + TemplateVersion for an Outgoing template-authored item', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await core.create(
      basePayload({ direction: 'Outgoing', templateReference: 'tpl-2', templateVersion: 3 }),
      'draft'
    );

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.TemplateReference).toBe('tpl-2');
    expect(row.TemplateVersion).toBe(3);
  });

  it('CMS-037 AC4: an Outgoing item authored from a template with no explicit version defaults TemplateVersion to 1', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await core.create(basePayload({ direction: 'Outgoing', templateReference: 'tpl-2' }), 'draft');

    expect(site.lists.CORMS_Correspondence.items[0].TemplateVersion).toBe(1);
  });

  it('an Outgoing item with no template reference remains eligible for the normal declaration flow', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await core.create(basePayload({ direction: 'Outgoing' }), 'draft');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(Object.prototype.hasOwnProperty.call(row, 'TemplateReference')).toBe(false);
  });

  it('AC10: Delivery Options default to Email=true / PhysicalMail=false when persisted as given', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await core.create(basePayload({ deliveryEmail: true, deliveryPhysicalMail: false }), 'draft');

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.DeliveryEmail).toBe(true);
    expect(row.DeliveryPhysicalMail).toBe(false);
  });

  it('returns the DateCreated it actually stamped, rather than the caller re-deriving it from a second `new Date()`', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const result = await core.create(basePayload(), 'submit');

    expect(result.dateCreated).toBe(site.lists.CORMS_Correspondence.items[0].DateCreated);
    expect(Number.isNaN(Date.parse(result.dateCreated))).toBe(false);
  });

  it('a second Save Draft click (existingId set) updates the same row instead of inserting a duplicate', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const first = await core.create(basePayload({ subject: 'First save' }), 'draft');
    await core.create(basePayload({ subject: 'Second save', existingId: first.id }), 'draft');

    expect(site.lists.CORMS_Correspondence.items).toHaveLength(1);
    expect(site.lists.CORMS_Correspondence.items[0].Title).toBe('Second save');
  });
});

describe('CMS-040 Part 6 — Timeline write backfill', () => {
  it('draft mode (new item): writes a single Created event', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const result = await core.create(basePayload(), 'draft');

    const rows = site.lists.CORMS_Timeline.items;
    expect(rows).toHaveLength(1);
    expect(rows[0].CorrespondenceId).toBe(result.id);
    expect(rows[0].EventType).toBe('Created');
  });

  it('submit mode (new item): writes Created, Submitted, and ReferenceAssigned, in that order', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const numbering = makeNumberingStub('OQ8-OPS-LTR-26-0099');
    const core = makeCore(site, numbering);

    const result = await core.create(basePayload(), 'submit');

    const rows = site.lists.CORMS_Timeline.items.filter((r) => r.CorrespondenceId === result.id);
    expect(rows.map((r) => r.EventType)).toEqual(['Created', 'Submitted', 'ReferenceAssigned']);
    expect(rows[2].Description).toContain('OQ8-OPS-LTR-26-0099');
  });

  it('a second Save Draft click (existingId set, still draft) does not write a second Created event', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const first = await core.create(basePayload({ subject: 'First save' }), 'draft');
    await core.create(basePayload({ subject: 'Second save', existingId: first.id }), 'draft');

    const rows = site.lists.CORMS_Timeline.items.filter((r) => r.CorrespondenceId === first.id);
    expect(rows.map((r) => r.EventType)).toEqual(['Created']);
  });

  it('submitting an existing draft (existingId set, mode submit) writes Submitted/ReferenceAssigned but not a second Created', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const numbering = makeNumberingStub('OQ8-OPS-LTR-26-0100');
    const core = makeCore(site, numbering);

    const draft = await core.create(basePayload({ subject: 'Draft' }), 'draft');
    await core.create(basePayload({ subject: 'Draft', existingId: draft.id }), 'submit');

    const rows = site.lists.CORMS_Timeline.items.filter((r) => r.CorrespondenceId === draft.id);
    expect(rows.map((r) => r.EventType)).toEqual(['Created', 'Submitted', 'ReferenceAssigned']);
  });
});
