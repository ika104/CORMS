import { canonicalSecurityTier, normalizeSecurityLevelTiers } from '../securityLevelRank';
import { ISecurityLevel } from '../../../models/ICorrespondenceMetadata';

describe('canonicalSecurityTier', () => {
  it('maps the standard English scale onto 1..5 ascending, Top Secret highest', () => {
    expect(canonicalSecurityTier('Public / Unclassified')).toBe(1);
    expect(canonicalSecurityTier('Unclassified')).toBe(1);
    expect(canonicalSecurityTier('Restricted')).toBe(2);
    expect(canonicalSecurityTier('Confidential')).toBe(3);
    expect(canonicalSecurityTier('Secret')).toBe(4);
    expect(canonicalSecurityTier('Top Secret')).toBe(5);
  });

  it('ranks "Top Secret" above "Secret" (compound checked before its substring)', () => {
    expect(canonicalSecurityTier('TOP SECRET')).toBe(5);
    expect(canonicalSecurityTier('secret')).toBe(4);
  });

  it('returns undefined for an unrecognized name', () => {
    expect(canonicalSecurityTier('Level Z')).toBeUndefined();
    expect(canonicalSecurityTier('')).toBeUndefined();
    expect(canonicalSecurityTier(undefined)).toBeUndefined();
  });
});

describe('normalizeSecurityLevelTiers', () => {
  const lvl = (id: string, name: string, tier: number): ISecurityLevel => ({ id, name, tier });

  it('re-tiers reversed RecordsHub numbering onto the canonical ascending scale and sorts it', () => {
    // Tenant numbered Top Secret = 1 (most sensitive) — the exact case that disabled the wrong pills.
    const input = [
      lvl('1', 'Top Secret', 1),
      lvl('2', 'Secret', 2),
      lvl('3', 'Confidential', 3),
      lvl('4', 'Restricted', 4),
      lvl('5', 'Unclassified', 5),
    ];
    const result = normalizeSecurityLevelTiers(input);
    expect(result.map((r) => [r.name, r.tier])).toEqual([
      ['Unclassified', 1],
      ['Restricted', 2],
      ['Confidential', 3],
      ['Secret', 4],
      ['Top Secret', 5],
    ]);
  });

  it('leaves the list untouched when a name is unrecognized', () => {
    const input = [lvl('1', 'Top Secret', 1), lvl('2', 'Level Z', 2)];
    expect(normalizeSecurityLevelTiers(input)).toBe(input);
  });

  it('leaves the list untouched when two names collide onto the same tier', () => {
    const input = [lvl('1', 'Secret', 1), lvl('2', 'Super Secret', 2)];
    // Both map to tier 4 → not distinct → returned as-is.
    expect(normalizeSecurityLevelTiers(input)).toBe(input);
  });
});
