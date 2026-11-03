import { checkCompleteness, checkDpi, checkFormat, runQualityGate } from '../scanQualityGate';
import { IScanPage } from '../dynamsoftTypes';

function page(overrides: Partial<IScanPage> = {}): IScanPage {
  return { dpi: 300, format: 'PDF/A', contentCoverage: 0.4, blob: new Blob(), ...overrides };
}

describe('CMS-002 — scanQualityGate', () => {
  it('AC5: flags a scan below 300 DPI', () => {
    expect(checkDpi(299)).toBe(false);
    expect(checkDpi(300)).toBe(true);
    expect(checkDpi(600)).toBe(true);
  });

  it('AC6: flags a format other than TIFF or PDF/A', () => {
    expect(checkFormat('JPEG')).toBe(false);
    expect(checkFormat('PNG')).toBe(false);
    expect(checkFormat('TIFF')).toBe(true);
    expect(checkFormat('PDF/A')).toBe(true);
    expect(checkFormat('pdf/a')).toBe(true);
  });

  it('AC7: flags a page with anomalously low content coverage as likely missing/blank', () => {
    const flags = checkCompleteness([page({ contentCoverage: 0.4 }), page({ contentCoverage: 0.001 })]);

    expect(flags[0].likelyMissing).toBe(false);
    expect(flags[1].likelyMissing).toBe(true);
  });

  it('runQualityGate: passes when DPI, format, and completeness all clear', () => {
    const result = runQualityGate([page(), page()]);

    expect(result.passed).toBe(true);
    expect(result.dpiFailed).toBe(false);
    expect(result.formatFailed).toBe(false);
  });

  it('runQualityGate: fails overall when any page fails DPI', () => {
    const result = runQualityGate([page(), page({ dpi: 150 })]);

    expect(result.passed).toBe(false);
    expect(result.dpiFailed).toBe(true);
  });

  it('runQualityGate: fails overall when any page fails format', () => {
    const result = runQualityGate([page({ format: 'JPEG' })]);

    expect(result.passed).toBe(false);
    expect(result.formatFailed).toBe(true);
  });

  it('runQualityGate: fails overall when a page is likely missing', () => {
    const result = runQualityGate([page({ contentCoverage: 0 })]);

    expect(result.passed).toBe(false);
    expect(result.completenessFlags[0].likelyMissing).toBe(true);
  });
});
