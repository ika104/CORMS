import {
  DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD,
  filterRecordClassificationsByClearance,
  isClassifiedCaptureTier,
  isRecordClassificationWithinClearance,
  parseClassifiedCaptureThreshold,
} from '../classificationRules';
import { IRecordClassification } from '../../../../models/ICorrespondenceMetadata';

describe('classificationRules — parseClassifiedCaptureThreshold (CMS-034 AC5)', () => {
  it('parses a numeric tier', () => {
    expect(parseClassifiedCaptureThreshold('3')).toBe(3);
  });

  it('falls back to the default for blank / non-numeric / out-of-range input', () => {
    expect(parseClassifiedCaptureThreshold(undefined)).toBe(DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD);
    expect(parseClassifiedCaptureThreshold('')).toBe(DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD);
    expect(parseClassifiedCaptureThreshold('abc')).toBe(DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD);
    expect(parseClassifiedCaptureThreshold('0')).toBe(DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD);
  });
});

describe('classificationRules — isClassifiedCaptureTier (CMS-034 AC5)', () => {
  it('is true only at or above the threshold', () => {
    expect(isClassifiedCaptureTier(4, 4)).toBe(true);
    expect(isClassifiedCaptureTier(5, 4)).toBe(true);
    expect(isClassifiedCaptureTier(3, 4)).toBe(false);
  });

  it('is false when either tier is missing', () => {
    expect(isClassifiedCaptureTier(undefined, 4)).toBe(false);
    expect(isClassifiedCaptureTier(4, undefined)).toBe(false);
  });
});

describe('classificationRules — isRecordClassificationWithinClearance (CMS-034 AC2)', () => {
  it('allows when the classification level is unknown (RecordsHub carries no column)', () => {
    expect(isRecordClassificationWithinClearance(undefined, 1)).toBe(true);
  });

  it('allows when the user clearance is unknown (never falsely blocks live picking)', () => {
    expect(isRecordClassificationWithinClearance(5, undefined)).toBe(true);
  });

  it('permits a classification at or below the user clearance and blocks one above it', () => {
    expect(isRecordClassificationWithinClearance(2, 3)).toBe(true);
    expect(isRecordClassificationWithinClearance(3, 3)).toBe(true);
    expect(isRecordClassificationWithinClearance(4, 3)).toBe(false);
  });
});

describe('classificationRules — filterRecordClassificationsByClearance (CMS-034 AC2)', () => {
  const list: IRecordClassification[] = [
    { id: 'rc-1', recordNumber: '1', name: 'Low', active: true, clearanceTier: 1 },
    { id: 'rc-4', recordNumber: '4', name: 'Unknown-level', active: true },
    { id: 'rc-5', recordNumber: '5', name: 'Top', active: true, clearanceTier: 5 },
  ];

  it('drops classifications above the user clearance but keeps unknown-level ones', () => {
    const result = filterRecordClassificationsByClearance(list, 2);

    expect(result.map((c) => c.id)).toEqual(['rc-1', 'rc-4']);
  });

  it('keeps everything when the user clearance is the top tier', () => {
    expect(filterRecordClassificationsByClearance(list, 5)).toHaveLength(3);
  });
});
