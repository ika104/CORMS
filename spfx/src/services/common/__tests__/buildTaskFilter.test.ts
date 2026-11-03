import { buildTaskFilter } from '../buildTaskFilter';
import { startOfTodayIso } from '../mapTaskRow';

const BASE = `Status ne ''`;
const TODAY = '2026-06-15T00:00:00.000Z';

describe('buildTaskFilter — emitted $filter shape', () => {
  it('with no filters, emits the base clause alone', () => {
    expect(buildTaskFilter(BASE, undefined, TODAY)).toBe(BASE);
  });

  it("the computed-Overdue clause emits a well-formed SharePoint datetime literal (no doubled time component)", () => {
    const clause = buildTaskFilter(BASE, { status: 'Overdue' }, TODAY);

    expect(clause).toContain(`DueDate lt datetime'2026-06-15T00:00:00Z'`);
    // Regression guard: appending a second `T00:00:00Z` to an already-full ISO instant produced
    // datetime'2026-06-15T00:00:00.000ZT00:00:00Z', which SharePoint rejects with a 400.
    expect(clause).not.toMatch(/datetime'[^']*Z[^']*Z'/);
    expect(clause).toContain(`Status ne 'Completed'`);
  });

  it("startOfTodayIso()'s real output also yields a well-formed literal", () => {
    const clause = buildTaskFilter(BASE, { status: 'Overdue' }, startOfTodayIso());

    expect(clause).toMatch(/DueDate lt datetime'\d{4}-\d{2}-\d{2}T00:00:00Z'/);
  });

  it('a non-Overdue status is a literal equality, not the computed condition', () => {
    expect(buildTaskFilter(BASE, { status: 'In Progress' }, TODAY)).toBe(`${BASE} and Status eq 'In Progress'`);
  });

  it('escapes single quotes in every user-supplied literal', () => {
    const clause = buildTaskFilter(BASE, { type: "O'Brien", freeText: "d'accord" }, TODAY);

    expect(clause).toContain(`TaskType eq 'O''Brien'`);
    expect(clause).toContain(`substringof('d''accord',Title)`);
  });

  it('never emits a substringof() against the AssignedToUser lookup path — SharePoint rejects it', () => {
    const clause = buildTaskFilter(BASE, { assignee: 'Layla' }, TODAY);

    expect(clause).toBe(BASE);
    expect(clause).not.toContain('AssignedToUser');
  });

  it('ANDs every supplied dimension together', () => {
    const clause = buildTaskFilter(BASE, { freeText: 'budget', type: 'Reminder', priority: 'High' }, TODAY);

    expect(clause).toBe(
      `${BASE} and (substringof('budget',Title) or substringof('budget',ReferenceNo)) and TaskType eq 'Reminder' and Priority eq 'High'`
    );
  });
});
