import { resolveClearanceTierSafely } from '../resolveClearanceTier';
import { IRecordsHubService } from '../../interfaces/IRecordsHubService';
import { DEFAULT_CLEARANCE_TIER } from '../clearance';

function stubRecordsHub(getCurrentUser: IRecordsHubService['getCurrentUser']): IRecordsHubService {
  return {
    getNavConfig: () => Promise.reject(new Error('not used in these tests')),
    getCurrentUser,
    getMyCorrespondence: () => Promise.resolve([]),
  };
}

// Regression coverage for a real bug found via manual testing: switching My Correspondence/
// Inbox-Sent to live on a site where recordsHubSiteUrl isn't configured to a real RecordsHub site
// yet caused getCurrentUser() to reject (DNS failure), which — with no catch — propagated out of
// the whole query and silently emptied it (zero tiles, empty grid, no visible error).
describe('resolveClearanceTierSafely', () => {
  it('returns the user’s real clearance tier on success', async () => {
    const service = stubRecordsHub(() =>
      Promise.resolve({ id: '1', displayName: 'Alice', email: 'a@x.com', roles: [], clearanceTier: 4 })
    );

    expect(await resolveClearanceTierSafely(service)).toBe(4);
  });

  it('falls back to DEFAULT_CLEARANCE_TIER when the resolved user has no clearanceTier', async () => {
    const service = stubRecordsHub(() => Promise.resolve({ id: '1', displayName: 'Alice', email: 'a@x.com', roles: [] }));

    expect(await resolveClearanceTierSafely(service)).toBe(DEFAULT_CLEARANCE_TIER);
  });

  it('falls back to DEFAULT_CLEARANCE_TIER instead of rejecting when getCurrentUser() fails (e.g. recordsHubSiteUrl not configured)', async () => {
    const service = stubRecordsHub(() => Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED')));

    await expect(resolveClearanceTierSafely(service)).resolves.toBe(DEFAULT_CLEARANCE_TIER);
  });
});
