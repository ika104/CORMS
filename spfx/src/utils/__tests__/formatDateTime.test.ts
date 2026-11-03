import { formatCardDate, formatCardDateTime } from '../formatDateTime';

describe('formatCardDateTime', () => {
  it('formats a local date-time as DD/MM/YYYY h:mm AM/PM', () => {
    // Built from local components so the assertion is timezone-independent.
    expect(formatCardDateTime(new Date(2026, 6, 19, 12, 4).toISOString())).toBe('19/07/2026 12:04 PM');
  });

  it('pads day/month/minutes and uses 12-hour morning time', () => {
    expect(formatCardDateTime(new Date(2026, 0, 5, 9, 7).toISOString())).toBe('05/01/2026 9:07 AM');
  });

  it('renders midnight as 12:00 AM and noon as 12:00 PM', () => {
    expect(formatCardDateTime(new Date(2026, 2, 1, 0, 0).toISOString())).toBe('01/03/2026 12:00 AM');
    expect(formatCardDateTime(new Date(2026, 2, 1, 12, 0).toISOString())).toBe('01/03/2026 12:00 PM');
  });

  it('returns a dash for empty and the raw value for an unparseable string', () => {
    expect(formatCardDateTime(undefined)).toBe('—');
    expect(formatCardDateTime('')).toBe('—');
    expect(formatCardDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('formatCardDate', () => {
  it('formats a bare YYYY-MM-DD as DD/MM/YYYY without shifting the day across timezones', () => {
    // Reformatted from its own digits, never through `new Date`, so a viewer behind UTC still
    // sees 01/06/2026 rather than the previous evening.
    expect(formatCardDate('2026-06-01')).toBe('01/06/2026');
  });

  it('formats a full ISO timestamp as its local date only, dropping the time', () => {
    expect(formatCardDate(new Date(2026, 6, 19, 12, 4).toISOString())).toBe('19/07/2026');
  });

  it('returns a dash for empty and the raw value for an unparseable string', () => {
    expect(formatCardDate(undefined)).toBe('—');
    expect(formatCardDate('')).toBe('—');
    expect(formatCardDate('not-a-date')).toBe('not-a-date');
  });
});
