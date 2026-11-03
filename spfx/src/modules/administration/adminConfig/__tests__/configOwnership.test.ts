import { resolveConfigOwner } from '../configOwnership';

describe('CMS-055 AC5 — config ownership derivation', () => {
  it('labels RH_ credential/reference keys as RecordsHub', () => {
    expect(resolveConfigOwner('RH_RecordsHub_API_Key')).toBe('RecordsHub');
    expect(resolveConfigOwner('RH_SecurityLevels_API_Key')).toBe('RecordsHub');
    expect(resolveConfigOwner('RH_SecurityPermission')).toBe('RecordsHub');
  });

  it('labels recordsHub.* list-URL/record pointers as RecordsHub', () => {
    expect(resolveConfigOwner('recordsHub.securityLevelsListUrl')).toBe('RecordsHub');
    expect(resolveConfigOwner('recordsHub.classificationsListUrl')).toBe('RecordsHub');
    expect(resolveConfigOwner('recordsHub.numberingRecordId')).toBe('RecordsHub');
  });

  it('labels every other key as CORMS-owned application config', () => {
    expect(resolveConfigOwner('RootSiteUrl')).toBe('CORMS');
    expect(resolveConfigOwner('pendingResponse.escalationDays')).toBe('CORMS');
    expect(resolveConfigOwner('powerAppsTaskFormUrl')).toBe('CORMS');
    expect(resolveConfigOwner('integration.elasticEndpoint')).toBe('CORMS');
    expect(resolveConfigOwner('admin.contentTypesJson')).toBe('CORMS');
  });
});
