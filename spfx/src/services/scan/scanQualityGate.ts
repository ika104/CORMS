import { IScanPage } from './dynamsoftTypes';

/** CMS-002 AC5 — reject/flag scans below 300 DPI. */
export const MIN_ACCEPTABLE_DPI = 300;

/** CMS-002 AC6 — scanner output is configured to TIFF or PDF/A only; this validates the SDK
 * actually produced one of those, defense-in-depth against a misconfigured/changed scanner profile. */
export const ACCEPTED_FORMATS = ['TIFF', 'PDF/A'];

/** Below this content-coverage ratio, a page is flagged as likely blank/missing rather than a
 * genuinely sparse page (e.g. a short cover note) — see checkCompleteness's TODO(confirm). */
const LIKELY_MISSING_COVERAGE_THRESHOLD = 0.02;

export function checkDpi(dpi: number): boolean {
  return dpi >= MIN_ACCEPTABLE_DPI;
}

export function checkFormat(format: string): boolean {
  return ACCEPTED_FORMATS.indexOf(format.toUpperCase() as (typeof ACCEPTED_FORMATS)[number]) !== -1;
}

export interface ICompletenessFlag {
  pageIndex: number;
  likelyMissing: boolean;
}

/**
 * CMS-002 AC7 — best-effort missing/blank-page heuristic.
 * TODO(confirm): "likely missing pages" detection is a best-effort heuristic pending product
 * guidance on the actual algorithm/threshold — refine once available. This implementation only
 * looks at the SDK's reported per-page content-coverage ratio; a real implementation might also
 * consider expected-vs-actual page count, duplicate blank templates, etc.
 */
export function checkCompleteness(pages: IScanPage[]): ICompletenessFlag[] {
  return pages.map((page, pageIndex) => ({
    pageIndex,
    likelyMissing: page.contentCoverage < LIKELY_MISSING_COVERAGE_THRESHOLD,
  }));
}

export interface IQualityGateResult {
  passed: boolean;
  dpiFailed: boolean;
  formatFailed: boolean;
  completenessFlags: ICompletenessFlag[];
}

/** Runs all three CMS-002 quality checks against a scan result and reports whether registration
 * should be blocked pending an explicit override (AC8). */
export function runQualityGate(pages: IScanPage[]): IQualityGateResult {
  const dpiFailed = pages.some((p) => !checkDpi(p.dpi));
  const formatFailed = pages.some((p) => !checkFormat(p.format));
  const completenessFlags = checkCompleteness(pages);
  const hasMissingPages = completenessFlags.some((f) => f.likelyMissing);

  return {
    passed: !dpiFailed && !formatFailed && !hasMissingPages,
    dpiFailed,
    formatFailed,
    completenessFlags,
  };
}
