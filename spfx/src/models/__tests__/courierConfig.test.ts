import { generateTrackingRef, courierFieldsComplete, DEFAULT_COURIERS, ICourierConfig } from '../ICourierConfig';

describe('generateTrackingRef', () => {
  it('formats as PREFIX-YYYYMMDD-###### with a fixed date/rand', () => {
    const ref = generateTrackingRef('ASX', new Date(2026, 7, 31), 0.780433);
    expect(ref).toBe('ASX-20260831-780433');
  });
  it('uppercases the prefix and falls back to REF when missing', () => {
    expect(generateTrackingRef('nol', new Date(2026, 0, 1), 0.000123)).toBe('NOL-20260101-000123');
    expect(generateTrackingRef(undefined, new Date(2026, 0, 1), 0.5)).toMatch(/^REF-20260101-\d{6}$/);
  });
});

describe('courierFieldsComplete', () => {
  const asyad = DEFAULT_COURIERS.find((c) => c.id === 'asyad') as ICourierConfig;

  it('is false until every required courier field has a value', () => {
    expect(courierFieldsComplete(asyad, {})).toBe(false);
    expect(courierFieldsComplete(asyad, { serviceLevel: 'Next-Day' })).toBe(false);
    expect(courierFieldsComplete(asyad, { serviceLevel: 'Next-Day', originHub: 'Muscat' })).toBe(true);
  });

  it('ignores optional fields', () => {
    const omanpost = DEFAULT_COURIERS.find((c) => c.id === 'omanpost') as ICourierConfig;
    // Only serviceLevel is required; deliveryOffice is optional.
    expect(courierFieldsComplete(omanpost, { serviceLevel: 'Standard' })).toBe(true);
  });

  it('is false for an undefined courier', () => {
    expect(courierFieldsComplete(undefined, {})).toBe(false);
  });
});
