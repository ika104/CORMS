import { diffDetailPatch, formatDetailChanges } from '../detailChangeSummary';

describe('diffDetailPatch', () => {
  it('returns no changes when the patch re-selects the same values', () => {
    const before = {
      originatingFunction: 'Operations Management',
      dueDate: '2026-09-23T00:00:00Z',
      comment: 'Please review',
      assignedToName: 'Abdullah Reda',
    };
    const changes = diffDetailPatch(before, {
      originatingFunction: 'Operations Management',
      dueDate: '2026-09-23', // same date, just the bare form the date input emits
      comment: 'Please review',
      assignedTo: { login: 'i:0#.f|membership|abdullah', name: 'Abdullah Reda' },
    });
    expect(changes).toEqual([]);
  });

  it('records each changed field with a readable before → after', () => {
    const before = {
      originatingFunction: 'Operations Management',
      dueDate: '2026-09-23T00:00:00Z',
      comment: 'Please review',
      assignedToName: 'Abdullah Reda',
    };
    const changes = diffDetailPatch(before, {
      originatingFunction: 'Legal Affairs',
      dueDate: '2026-09-30',
      comment: 'Escalated to legal',
      assignedTo: { login: 'i:0#.f|membership|zyad', name: 'zyad' },
    });
    expect(changes).toEqual([
      { field: 'originatingFunction', label: 'Originating Function', before: 'Operations Management', after: 'Legal Affairs' },
      { field: 'dueDate', label: 'Due Date', before: '23/09/2026', after: '30/09/2026' },
      { field: 'assignedTo', label: 'Assigned To', before: 'Abdullah Reda', after: 'zyad' },
      { field: 'comment', label: 'Comments', before: 'Please review', after: 'Escalated to legal' },
    ]);
  });

  it('shows a dash for a value that was empty before or is cleared', () => {
    const changes = diffDetailPatch({}, { originatingFunction: 'Legal Affairs', comment: '' });
    // comment '' vs before undefined → both empty, no change; only originatingFunction changes.
    expect(changes).toEqual([
      { field: 'originatingFunction', label: 'Originating Function', before: '—', after: 'Legal Affairs' },
    ]);
  });

  it('formats the changes as a single audit line', () => {
    const line = formatDetailChanges([
      { field: 'originatingFunction', label: 'Originating Function', before: 'A', after: 'B' },
      { field: 'assignedTo', label: 'Assigned To', before: '—', after: 'zyad' },
    ]);
    expect(line).toBe('Originating Function: A → B; Assigned To: — → zyad');
  });
});
