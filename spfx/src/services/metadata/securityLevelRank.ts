import { ISecurityLevel } from '../../models/ICorrespondenceMetadata';

/**
 * Maps a security-level display name to CORMS's canonical ascending sensitivity tier
 * (1 = Public/Unclassified … 5 = Top Secret — the SECURITY_TIERS / IUser.clearanceTier scale that
 * clearance.ts's tierToSecurityLevel and every clearance check rely on).
 *
 * Why this exists: RecordsHub's RH_SecurityLevels list ranks levels in its own RH_SecurityNumber
 * column, whose numeric direction is NOT guaranteed to match CORMS's ascending scale (a tenant may
 * number Top Secret = 1). Trusting that raw number made the Create Correspondence pills disable the
 * wrong side of the scale — e.g. a Top-Secret-cleared user seeing only Top Secret enabled — and,
 * worse, persisted the wrong SecurityLevel (tierToSecurityLevel maps by ascending tier). Deriving
 * the tier from the level's NAME instead pins every path to the one canonical scale.
 *
 * Keyword-matched (case-insensitive, most specific first so "Top Secret" wins over "Secret"),
 * covering the standard English scale plus common Arabic labels. Returns undefined when the name
 * matches no known level, so callers can fall back rather than mis-rank an unrecognized value.
 */
export function canonicalSecurityTier(name: string | undefined): number | undefined {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return undefined;
  // Order matters: check the compound / most-sensitive labels before their substrings.
  if (n.indexOf('top secret') !== -1 || n.indexOf('topsecret') !== -1 || n.indexOf('للغاية') !== -1) return 5;
  if (n.indexOf('confidential') !== -1 || n.indexOf('سري') !== -1 || n.indexOf('سرى') !== -1) return 3;
  if (n.indexOf('secret') !== -1) return 4;
  if (n.indexOf('restrict') !== -1 || n.indexOf('مقيد') !== -1 || n.indexOf('مقيّد') !== -1) return 2;
  if (
    n.indexOf('unclass') !== -1 ||
    n.indexOf('public') !== -1 ||
    n.indexOf('عام') !== -1 ||
    n.indexOf('غير مصنف') !== -1
  ) {
    return 1;
  }
  return undefined;
}

/**
 * Re-tiers RecordsHub security levels onto CORMS's canonical ascending scale (see
 * canonicalSecurityTier) when every level's name is recognisable and the resulting tiers are
 * distinct — then sorts least→most sensitive. If any name is unknown or two collide, the input is
 * returned unchanged (deduped/ordered as the caller already had it) so a non-standard tenant scale
 * is never silently corrupted.
 */
export function normalizeSecurityLevelTiers(levels: ISecurityLevel[]): ISecurityLevel[] {
  const canonical = levels.map((level) => ({ level, tier: canonicalSecurityTier(level.name) }));
  const tiers = canonical.map((c) => c.tier);
  const allKnown = tiers.every((tier) => tier !== undefined);
  const allDistinct = new Set(tiers).size === tiers.length;
  if (!allKnown || !allDistinct) return levels;
  return canonical
    .map(({ level, tier }) => ({ ...level, tier: tier as number }))
    .sort((a, b) => a.tier - b.tier);
}
