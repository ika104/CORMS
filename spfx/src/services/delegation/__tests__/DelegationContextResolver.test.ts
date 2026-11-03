import { DelegationContextResolver } from '../DelegationContextResolver';
import { CorrespondenceDetailServiceCore } from '../../correspondenceDetail/CorrespondenceDetailServiceCore';
import { InMemoryAuditTrailService } from '../../correspondenceDetail/__tests__/testUtils/InMemoryAuditTrailService';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const ACTING_USER_ID = 20;
const DELEGATOR_ID = 10;

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

describe('CMS-017 AC8 — DelegationContextResolver.getActiveDelegationFor', () => {
  it('returns the delegator when an Active, in-range delegation exists for the acting user', async () => {
    const site = createFakeSite();
    seedList(site, 'CORMS_Delegations', [
      {
        Id: 1,
        DelegatorId: DELEGATOR_ID,
        DelegateId: ACTING_USER_ID,
        Status: 'Active',
        StartDate: isoDaysFromNow(-5),
        EndDate: isoDaysFromNow(5),
      },
    ]);
    const resolver = new DelegationContextResolver(createFakeSp(site));

    const result = await resolver.getActiveDelegationFor(String(ACTING_USER_ID));

    expect(result).toEqual({ delegatorId: String(DELEGATOR_ID) });
  });

  it('returns undefined when no delegation exists for the acting user', async () => {
    const site = createFakeSite();
    seedList(site, 'CORMS_Delegations', []);
    const resolver = new DelegationContextResolver(createFakeSp(site));

    expect(await resolver.getActiveDelegationFor(String(ACTING_USER_ID))).toBeUndefined();
  });

  it('returns undefined when the delegation exists but today is outside its date range', async () => {
    const site = createFakeSite();
    seedList(site, 'CORMS_Delegations', [
      {
        Id: 1,
        DelegatorId: DELEGATOR_ID,
        DelegateId: ACTING_USER_ID,
        Status: 'Active',
        StartDate: isoDaysFromNow(5),
        EndDate: isoDaysFromNow(10),
      },
    ]);
    const resolver = new DelegationContextResolver(createFakeSp(site));

    expect(await resolver.getActiveDelegationFor(String(ACTING_USER_ID))).toBeUndefined();
  });

  it('returns undefined when Status is not Active', async () => {
    const site = createFakeSite();
    seedList(site, 'CORMS_Delegations', [
      {
        Id: 1,
        DelegatorId: DELEGATOR_ID,
        DelegateId: ACTING_USER_ID,
        Status: 'Revoked',
        StartDate: isoDaysFromNow(-5),
        EndDate: isoDaysFromNow(5),
      },
    ]);
    const resolver = new DelegationContextResolver(createFakeSp(site));

    expect(await resolver.getActiveDelegationFor(String(ACTING_USER_ID))).toBeUndefined();
  });
});

describe('CMS-017 AC8 — CorrespondenceDetailServiceCore.logView wiring', () => {
  it('appends "(on behalf of X)" to Details when the acting user has an active delegation', async () => {
    const site = createFakeSite(ACTING_USER_ID);
    seedList(site, 'CORMS_Delegations', [
      {
        Id: 1,
        DelegatorId: DELEGATOR_ID,
        DelegateId: ACTING_USER_ID,
        Status: 'Active',
        StartDate: isoDaysFromNow(-5),
        EndDate: isoDaysFromNow(5),
      },
    ]);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = new CorrespondenceDetailServiceCore(
      createFakeSp(site),
      async () => 5,
      auditTrailService
    );

    await core.logView('1', 'Viewed Details', 'Opened correspondence: Budget Approval');

    expect(auditTrailService.entries[0].details).toBe(`Opened correspondence: Budget Approval (on behalf of ${DELEGATOR_ID})`);
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });

  it('does not append an OnBehalfOf suffix when no active delegation exists', async () => {
    const site = createFakeSite(ACTING_USER_ID);
    seedList(site, 'CORMS_Delegations', []);
    const auditTrailService = new InMemoryAuditTrailService();
    const core = new CorrespondenceDetailServiceCore(
      createFakeSp(site),
      async () => 5,
      auditTrailService
    );

    await core.logView('1', 'Viewed Details', 'Opened correspondence: Budget Approval');

    expect(auditTrailService.entries[0].details).toBe('Opened correspondence: Budget Approval');
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
  });
});
