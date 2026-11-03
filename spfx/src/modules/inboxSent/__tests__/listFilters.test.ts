import { ICorrespondenceStub } from '../../../models/ICorrespondence';
import { EMPTY_LIST_FILTERS, hasActiveListFilters, IListFilters, matchesListFilters } from '../listFilters';

function stub(overrides: Partial<ICorrespondenceStub>): ICorrespondenceStub {
  return {
    id: 'C-1',
    referenceNumber: 'OQ8-OPS-RPT-25-001',
    subject: 'Annual Report Submission',
    type: 'Report',
    direction: 'Incoming',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 2,
    department: 'Operations',
    createdAt: '2025-03-15',
    ...overrides,
  };
}

function filters(overrides: Partial<IListFilters>): IListFilters {
  return { ...EMPTY_LIST_FILTERS, ...overrides };
}

describe('CMS-039 AC4 — free-text search on subject and reference number', () => {
  it('matches on the subject, case-insensitively', () => {
    expect(matchesListFilters(stub({}), filters({ freeText: 'annual report' }))).toBe(true);
  });

  it('matches on the reference number', () => {
    expect(matchesListFilters(stub({}), filters({ freeText: 'RPT-25-001' }))).toBe(true);
  });

  it('excludes an item matching neither subject nor reference number', () => {
    expect(matchesListFilters(stub({}), filters({ freeText: 'procurement' }))).toBe(false);
  });

  it('does not match on other fields — the AC scopes search to subject and reference number', () => {
    // 'Operations' is the department, not the subject or the reference number.
    expect(matchesListFilters(stub({}), filters({ freeText: 'Operations' }))).toBe(false);
  });

  it('an all-whitespace term is treated as no term at all', () => {
    expect(matchesListFilters(stub({}), filters({ freeText: '   ' }))).toBe(true);
  });
});

describe('CMS-039 AC5 — date-range, status, security level and team filters', () => {
  it('date range is inclusive on both bounds', () => {
    const item = stub({ createdAt: '2025-03-15' });
    expect(matchesListFilters(item, filters({ dateFrom: '2025-03-15', dateTo: '2025-03-15' }))).toBe(true);
  });

  it('excludes an item before dateFrom and after dateTo', () => {
    expect(matchesListFilters(stub({ createdAt: '2025-03-14' }), filters({ dateFrom: '2025-03-15' }))).toBe(false);
    expect(matchesListFilters(stub({ createdAt: '2025-03-16' }), filters({ dateTo: '2025-03-15' }))).toBe(false);
  });

  it('compares only the date part, so a full ISO timestamp ranges the same as a yyyy-MM-dd value', () => {
    // The current client-side data flow stores 'yyyy-MM-dd'; the SharePoint-backed one returns a
    // full ISO timestamp. Both must fall inside a range whose bound is that same day.
    const item = stub({ createdAt: '2025-03-15T09:30:00Z' });
    expect(matchesListFilters(item, filters({ dateFrom: '2025-03-15', dateTo: '2025-03-15' }))).toBe(true);
  });

  it('filters on status, security tier and team independently', () => {
    expect(matchesListFilters(stub({}), filters({ status: 'Registered' }))).toBe(true);
    expect(matchesListFilters(stub({}), filters({ status: 'Draft' }))).toBe(false);
    expect(matchesListFilters(stub({}), filters({ securityTier: '2' }))).toBe(true);
    expect(matchesListFilters(stub({}), filters({ securityTier: '3' }))).toBe(false);
    expect(matchesListFilters(stub({}), filters({ department: 'Operations' }))).toBe(true);
    expect(matchesListFilters(stub({}), filters({ department: 'Finance' }))).toBe(false);
  });

  it('ANDs every set filter — one non-match excludes the item', () => {
    const all = filters({ freeText: 'annual', status: 'Registered', securityTier: '2', department: 'Finance' });
    expect(matchesListFilters(stub({}), all)).toBe(false);
  });

  it('an item passes when nothing is set', () => {
    expect(matchesListFilters(stub({}), EMPTY_LIST_FILTERS)).toBe(true);
  });
});

describe('CMS-039 AC5 — the single Clear Filters action', () => {
  it('reports no active filters for the cleared state, and active for any one field', () => {
    expect(hasActiveListFilters(EMPTY_LIST_FILTERS)).toBe(false);
    (['freeText', 'dateFrom', 'dateTo', 'status', 'securityTier', 'department'] as (keyof IListFilters)[]).forEach(
      (field) => {
        expect(hasActiveListFilters(filters({ [field]: 'x' }))).toBe(true);
      }
    );
  });
});
