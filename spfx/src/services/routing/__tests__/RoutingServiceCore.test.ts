import { RoutingServiceCore } from '../RoutingServiceCore';
import { IAuditTrailService } from '../../interfaces/IAuditTrailService';
import { IGlobalAuditEntry } from '../../../models/IAuditTrail';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CORRESPONDENCE_ID = '100';
const ACTOR_ID = 42;

function makeFakeAuditTrailService(): IAuditTrailService & { logEvent: jest.Mock } {
  return {
    getEntries: jest.fn().mockResolvedValue([]),
    logEvent: jest.fn().mockImplementation((entry: Omit<IGlobalAuditEntry, 'id' | 'seq' | 'category' | 'chainStatus'>) =>
      Promise.resolve({ id: 'AUD-0001', seq: 1, category: 'correspondence', chainStatus: 'valid', ...entry })
    ),
    getReassignmentsInvolving: jest.fn().mockResolvedValue([]),
  };
}

function makeSiteWithItem(): ReturnType<typeof createFakeSite> {
  const site = createFakeSite(ACTOR_ID);
  seedList(site, 'CORMS_Correspondence', [{ Id: Number(CORRESPONDENCE_ID), Status: 'Registered', Direction: 'Incoming' }]);
  seedList(site, 'CORMS_Timeline', []);
  return site;
}

describe('CMS-011 RoutingServiceCore — Route Incoming Correspondence backend', () => {
  it('persists next action, recipients, attribution and advances the item out of the queue (AC3/AC6/AC8)', async () => {
    const site = makeSiteWithItem();
    const audit = makeFakeAuditTrailService();
    const core = new RoutingServiceCore(createFakeSp(site), audit);

    await core.route({
      correspondenceId: CORRESPONDENCE_ID,
      referenceNo: 'REF-1',
      recipients: [
        { id: 'Legal', name: 'Legal', kind: 'department' },
        { id: '11', name: 'Sara', kind: 'user' },
      ],
      nextAction: 'Approve',
      matrixApplied: false,
    });

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.NextAction).toBe('Approve');
    expect(row.Status).toBe('In Review'); // list-side value for the model's 'InReview' — leaves the Registered queue
    expect(row.CurrentDepartment).toBe('Legal'); // department recipient
    expect(row.AssignedToId).toBe(11); // individual recipient becomes the primary assignee
    expect(row.RoutedBy).toBe(String(ACTOR_ID));
    expect(JSON.parse(row.RoutedRecipients as string)).toHaveLength(2);
  });

  it('writes an attributed, timestamped Correspondence Routed audit entry (AC6)', async () => {
    const site = makeSiteWithItem();
    const audit = makeFakeAuditTrailService();
    const core = new RoutingServiceCore(createFakeSp(site), audit);

    await core.route({
      correspondenceId: CORRESPONDENCE_ID,
      recipients: [{ id: 'Finance', name: 'Finance', kind: 'department' }],
      nextAction: 'Review',
      matrixApplied: true,
    });

    expect(audit.logEvent).toHaveBeenCalledTimes(1);
    const entry = audit.logEvent.mock.calls[0][0];
    expect(entry.action).toBe('Correspondence Routed');
    expect(entry.objectId).toBe(CORRESPONDENCE_ID);
    expect(entry.timestamp).toBeTruthy();
    const details = JSON.parse(entry.details);
    expect(details.nextAction).toBe('Review');
    expect(details.matrixApplied).toBe(true);
    expect(details.recipients[0].name).toBe('Finance');
  });

  it('writes a Timeline entry for the routing', async () => {
    const site = makeSiteWithItem();
    const core = new RoutingServiceCore(createFakeSp(site), makeFakeAuditTrailService());

    await core.route({
      correspondenceId: CORRESPONDENCE_ID,
      recipients: [{ id: 'Finance', name: 'Finance', kind: 'department' }],
      nextAction: 'Distribute',
    });

    const timeline = site.lists.CORMS_Timeline.items;
    expect(timeline).toHaveLength(1);
    expect(timeline[0].EventType).toBe('Routed');
    expect(String(timeline[0].Description)).toContain('Distribute');
  });

  it('resolves a people-picker login key to a SharePoint user id (ensureUser) for AssignedToId', async () => {
    const site = makeSiteWithItem();
    const login = 'i:0#.f|membership|sara@ssloman.om';
    site.ensuredUsers = { [login]: 27 };
    const core = new RoutingServiceCore(createFakeSp(site), makeFakeAuditTrailService());

    await core.route({
      correspondenceId: CORRESPONDENCE_ID,
      recipients: [{ id: login, name: 'Sara', kind: 'user' }],
      nextAction: 'Review',
    });

    expect(site.lists.CORMS_Correspondence.items[0].AssignedToId).toBe(27);
  });

  it('leaves the item unassigned (does not fail the route) when the individual cannot be resolved', async () => {
    const site = makeSiteWithItem(); // no ensuredUsers entry for the login
    const core = new RoutingServiceCore(createFakeSp(site), makeFakeAuditTrailService());

    await core.route({
      correspondenceId: CORRESPONDENCE_ID,
      recipients: [{ id: 'i:0#.f|membership|ghost@ssloman.om', name: 'Ghost', kind: 'user' }],
      nextAction: 'Review',
    });

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.AssignedToId).toBeUndefined();
    expect(row.NextAction).toBe('Review'); // the route still persisted
  });

  it('routes to a department only (no individual assignee) without setting AssignedToId', async () => {
    const site = makeSiteWithItem();
    const core = new RoutingServiceCore(createFakeSp(site), makeFakeAuditTrailService());

    await core.route({
      correspondenceId: CORRESPONDENCE_ID,
      recipients: [{ id: 'Legal', name: 'Legal', kind: 'department' }],
      nextAction: 'Review',
    });

    const row = site.lists.CORMS_Correspondence.items[0];
    expect(row.CurrentDepartment).toBe('Legal');
    expect(row.AssignedToId).toBeUndefined();
  });
});
