import { buildColumnFilterClause } from '../buildColumnFilterClause';
import { normalizeForFilter } from '../textNormalizer';

describe('CMS-044', () => {
  it('AC9: a text column translates into a substringof() clause built from the same Arabic-aware normalization the in-memory filter uses', () => {
    const rawValue = 'أحمد'; // contains alef-hamza, which normalizeForFilter maps to bare alef
    const normalized = normalizeForFilter(rawValue);

    const clause = buildColumnFilterClause({ field: 'Title', type: 'text' }, rawValue);

    // Asserts buildColumnFilterClause genuinely delegates to normalizeForFilter (not a
    // reimplementation) — the raw alef-hamza character must not survive into the clause.
    expect(normalized).not.toBe(rawValue);
    expect(clause).toBe(`substringof('${normalized}',Title)`);
    expect(clause).not.toContain(rawValue);
  });

  it('AC9: a number column translates into an eq clause on the numeric value', () => {
    const clause = buildColumnFilterClause({ field: 'SortOrder', type: 'number' }, '42');

    expect(clause).toBe('SortOrder eq 42');
  });

  it('AC9: a date column translates into an eq datetime literal clause', () => {
    const clause = buildColumnFilterClause({ field: 'DateCreated', type: 'date' }, '2026-01-15');

    expect(clause).toBe("DateCreated eq datetime'2026-01-15T00:00:00Z'");
  });

  it('escapes a single quote in a text filter value', () => {
    const clause = buildColumnFilterClause({ field: 'Title', type: 'text' }, "O'Brien");

    expect(clause).toBe("substringof('o''brien',Title)");
  });
});
