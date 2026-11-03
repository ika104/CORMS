import { securityLevelToTier, securityLevelsAtOrBelow, tierToSecurityLevel } from '../clearance';

// tierToSecurityLevel is the write-side counterpart the Create Correspondence backend task added
// (CorrespondenceServiceCore -> buildCorrespondenceRowForWrite). These assert it round-trips with
// the long-standing read side and, critically, that it never fails *open*.
describe('clearance — tier <-> SecurityLevel mapping', () => {
  it('round-trips every defined tier through the read-side mapper', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const level = tierToSecurityLevel(tier);
      expect(level).toBeDefined();
      expect(securityLevelToTier(level)).toBe(tier);
    }
  });

  it('maps tier 1 and tier 5 to the schema choices the read side already knows', () => {
    expect(tierToSecurityLevel(1)).toBe('Public/Unclassified');
    expect(tierToSecurityLevel(5)).toBe('Top Secret');
  });

  it('treats an unset/zero/negative tier as "no classification chosen yet"', () => {
    expect(tierToSecurityLevel(undefined)).toBeUndefined();
    expect(tierToSecurityLevel(0)).toBeUndefined();
    expect(tierToSecurityLevel(-3)).toBeUndefined();
  });

  it('clamps an out-of-range tier to the most restrictive level, never to a blank that reads back as tier 1', () => {
    // Failing open is the real risk: an undefined result is persisted as an empty SecurityLevel,
    // which securityLevelToTier then maps to DEFAULT_CLEARANCE_TIER (1) — visible to everyone.
    expect(tierToSecurityLevel(6)).toBe('Top Secret');
    expect(securityLevelToTier(tierToSecurityLevel(99))).toBe(5);
  });

  it('securityLevelsAtOrBelow still only widens with the clearance tier', () => {
    expect(securityLevelsAtOrBelow(1)).toEqual(['Public/Unclassified']);
    expect(securityLevelsAtOrBelow(5)).toHaveLength(5);
  });
});
