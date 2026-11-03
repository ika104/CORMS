import { IRecordClassification } from '../../../models/ICorrespondenceMetadata';

/**
 * CMS-034 AC2/AC5 — pure classification/clearance rules, kept free of React/DOM so they can be
 * unit-tested on their own (mirrors approvalChain.ts's isEligibleForStep, whose "unknown level is
 * allowed" stance these deliberately reuse).
 */

/**
 * AC5 — default security tier at/above which capturing classified correspondence is restricted to
 * vetted users. Overridable per tenant via the CORMS_AdminConfig `security.classifiedCaptureThreshold`
 * key. Defaults to 4 (Secret) so Secret/Top-Secret capture is the vetted-only band out of the box.
 */
export const DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD = 4;

export const CLASSIFIED_CAPTURE_THRESHOLD_KEY = 'security.classifiedCaptureThreshold';

/** Parses the admin-config threshold value (a tier number). Falls back to the default for blank/
 * non-numeric/out-of-range input so a typo never disables the gate or blocks all capture. */
export function parseClassifiedCaptureThreshold(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD;
  return Math.round(value);
}

/**
 * AC5 — whether the chosen security tier falls in the vetted-only band. A capture is restricted
 * only when a threshold is configured and the tier is at or above it.
 */
export function isClassifiedCaptureTier(securityTier: number | undefined, threshold: number | undefined): boolean {
  if (!securityTier || !threshold) return false;
  return securityTier >= threshold;
}

/**
 * AC2 — a record classification is selectable when the user's clearance is >= the classification's
 * minimum level. An unknown classification level (undefined — RecordsHub may not expose one) is
 * treated as selectable, and an unknown user clearance is treated as allowed, so real picking is
 * never falsely blocked; only a *known* level above a *known* clearance is filtered out.
 */
export function isRecordClassificationWithinClearance(
  classificationTier: number | undefined,
  clearanceTier: number | undefined
): boolean {
  if (classificationTier === undefined) return true;
  if (clearanceTier === undefined) return true;
  return clearanceTier >= classificationTier;
}

/** AC2 — filters a classification list down to the ones the user's clearance permits. */
export function filterRecordClassificationsByClearance(
  classifications: IRecordClassification[],
  clearanceTier: number | undefined
): IRecordClassification[] {
  return classifications.filter((c) => isRecordClassificationWithinClearance(c.clearanceTier, clearanceTier));
}
