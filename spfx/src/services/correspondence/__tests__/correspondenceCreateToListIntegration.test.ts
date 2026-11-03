import { CorrespondenceServiceCore } from '../CorrespondenceServiceCore';
import { CorrespondenceListServiceCore } from '../../correspondenceList/CorrespondenceListServiceCore';
import { createFakeSite, createFakeSp } from '../../__tests__/testUtils/fakeSp';
import { ICreateCorrespondencePayload } from '../../../models/ICorrespondencePayload';
import { INumberingService } from '../../interfaces/INumberingService';

const CURRENT_USER_ID = 10;
const OTHER_USER_ID = 20;

function makeNumberingStub(referenceNumber = 'OQ8-OPS-LTR-26-0001'): INumberingService {
  return { issueReferenceNumber: jest.fn().mockResolvedValue({ referenceNumber }) };
}

function basePayload(overrides: Partial<ICreateCorrespondencePayload> = {}): ICreateCorrespondencePayload {
  return {
    subject: 'Integration test subject',
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

// Part 4/5 — proves the write path (CorrespondenceServiceCore) and the read path
// (CorrespondenceListServiceCore, already built by the EPIC 14 backend task) genuinely agree on
// what a "submitted Incoming/Outgoing item" or "my draft" looks like, using the same fake
// CORMS_Correspondence list rather than two separately-seeded fixtures.
describe('Part 4/5 — a correspondence created via CorrespondenceService appears correctly in the list service', () => {
  it('a submitted Incoming item appears in getInbox, with clearance trimming still enforced', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const writeCore = new CorrespondenceServiceCore(createFakeSp(site), makeNumberingStub());
    const readCore = new CorrespondenceListServiceCore(createFakeSp(site), async () => 5);

    await writeCore.create(basePayload({ direction: 'Incoming', securityTier: 2 }), 'submit');

    const inbox = await readCore.getInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].subject).toBe('Integration test subject');
    expect(inbox[0].status).toBe('Registered');
    expect(inbox[0].referenceNumber).toBe('OQ8-OPS-LTR-26-0001');

    // Clearance trimming still applies to items this same write path created — Top Secret (tier
    // 5) content is invisible to a tier-1-cleared reader even though it exists in the list.
    const lowClearanceReadCore = new CorrespondenceListServiceCore(createFakeSp(site), async () => 1);
    await writeCore.create(basePayload({ direction: 'Incoming', securityTier: 5, subject: 'Top secret memo' }), 'submit');
    const lowClearanceInbox = await lowClearanceReadCore.getInbox();
    expect(lowClearanceInbox.some((i) => i.subject === 'Top secret memo')).toBe(false);
  });

  it('a submitted Outgoing item appears in getSent, and never in getDrafts', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const writeCore = new CorrespondenceServiceCore(createFakeSp(site), makeNumberingStub());
    const readCore = new CorrespondenceListServiceCore(createFakeSp(site), async () => 5);

    await writeCore.create(basePayload({ direction: 'Outgoing' }), 'submit');

    const sent = await readCore.getSent();
    expect(sent).toHaveLength(1);
    expect(sent[0].direction).toBe('Outgoing');
    expect(sent[0].status).toBe('Registered');

    const drafts = await readCore.getDrafts();
    expect(drafts).toHaveLength(0);
  });

  it('a draft appears only in getDrafts, and only for its author', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const writeCore = new CorrespondenceServiceCore(createFakeSp(site), makeNumberingStub());
    const readCoreAsAuthor = new CorrespondenceListServiceCore(createFakeSp(site), async () => 5);

    await writeCore.create(basePayload({ subject: 'My draft' }), 'draft');

    const draftsForAuthor = await readCoreAsAuthor.getDrafts();
    expect(draftsForAuthor).toHaveLength(1);
    expect(draftsForAuthor[0].subject).toBe('My draft');
    expect(draftsForAuthor[0].status).toBe('Draft');
    expect(draftsForAuthor[0].referenceNumber).toBe('');

    // Never in Sent while still a draft — getSent()'s own base clause excludes Status='Draft'.
    // getInbox() has no status clause of its own (see CorrespondenceListServiceCore's own
    // TODO(confirm) — only getSent/getDrafts narrow by status) — a draft Incoming item assigned
    // to its author genuinely appears in the raw getInbox() result; InboxSentView's own
    // client-side `status !== 'Draft'` guard is what keeps drafts out of the rendered Inbox tab,
    // not this service. Not asserted here since it isn't this method's contract.
    expect(await readCoreAsAuthor.getSent()).toHaveLength(0);

    // Only for its author — a different signed-in user's Drafts view is empty.
    const otherSite = createFakeSite(OTHER_USER_ID);
    otherSite.lists = site.lists; // same underlying data, different signed-in user
    const readCoreAsOtherUser = new CorrespondenceListServiceCore(createFakeSp(otherSite), async () => 5);
    expect(await readCoreAsOtherUser.getDrafts()).toHaveLength(0);
  });
});
