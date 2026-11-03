import { PhysicalAttachmentServiceCore } from '../PhysicalAttachmentServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;
const THIS_YEAR = new Date().getUTCFullYear();

function makeCore(site: ReturnType<typeof createFakeSite>): PhysicalAttachmentServiceCore {
  return new PhysicalAttachmentServiceCore(createFakeSp(site));
}

describe('CMS-003 — PhysicalAttachmentServiceCore', () => {
  it('create generates a PHY-{year}-{serial} identifier and persists the row', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const record = await core.create({ correspondenceId: '1', storageLocation: 'Archive Room B, Shelf 4', description: 'Signed original contract' });

    expect(record.resourceIdentifier).toBe(`PHY-${THIS_YEAR}-0001`);
    expect(record.correspondenceId).toBe('1');
    expect(record.storageLocation).toBe('Archive Room B, Shelf 4');
  });

  it('generates sequential identifiers within the same year', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    const first = await core.create({ correspondenceId: '1', storageLocation: 'A', description: 'a' });
    const second = await core.create({ correspondenceId: '1', storageLocation: 'B', description: 'b' });

    expect(first.resourceIdentifier).toBe(`PHY-${THIS_YEAR}-0001`);
    expect(second.resourceIdentifier).toBe(`PHY-${THIS_YEAR}-0002`);
  });

  it('retries on a simulated collision — the naive count-based guess collides with an existing row from a gap', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    // Only one row exists for this year, but it's numbered 0002 (simulating an earlier 0001 that
    // was deleted) — the count-based guess (count=1 -> serial 2) collides with this exact row,
    // exercising the check-then-insert retry rather than just the happy path.
    seedList(site, 'CORMS_PhysicalAttachments', [
      { Id: 1, CorrespondenceId: '1', ResourceIdentifier: `PHY-${THIS_YEAR}-0002`, StorageLocation: 'X', Description: 'x' },
    ]);
    const core = makeCore(site);

    const record = await core.create({ correspondenceId: '2', storageLocation: 'Y', description: 'y' });

    expect(record.resourceIdentifier).toBe(`PHY-${THIS_YEAR}-0003`);
    // Uniqueness: no two rows share a ResourceIdentifier.
    const identifiers = site.lists.CORMS_PhysicalAttachments.items.map((i) => i.ResourceIdentifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('getByCorrespondence returns only items linked to the given correspondence', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    await core.create({ correspondenceId: '1', storageLocation: 'A', description: 'a' });
    await core.create({ correspondenceId: '2', storageLocation: 'B', description: 'b' });
    await core.create({ correspondenceId: '1', storageLocation: 'C', description: 'c' });

    const rows = await core.getByCorrespondence('1');

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.correspondenceId === '1')).toBe(true);
  });

  it('AC4: search filters by ResourceIdentifier (URI)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    const created = await core.create({ correspondenceId: '1', storageLocation: 'Archive A', description: 'x' });
    await core.create({ correspondenceId: '2', storageLocation: 'Archive B', description: 'y' });

    const rows = await core.search(created.resourceIdentifier);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
  });

  it('AC4: search filters by storage location', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);
    await core.create({ correspondenceId: '1', storageLocation: 'Archive Room B', description: 'x' });
    await core.create({ correspondenceId: '2', storageLocation: 'Vault C', description: 'y' });

    const rows = await core.search('Vault');

    expect(rows).toHaveLength(1);
    expect(rows[0].storageLocation).toBe('Vault C');
  });
});
