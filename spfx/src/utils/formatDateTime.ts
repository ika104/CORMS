/**
 * Formats a stored ISO date/datetime into the friendly "DD/MM/YYYY h:mm AM/PM" the card and list
 * surfaces show (e.g. "19/07/2026 12:04 PM"), instead of the raw ISO string the grids used to print.
 * Rendered in the viewer's local time — the natural reading for a person looking at the card.
 * Returns '—' for an empty value and the original string for anything unparseable, so a bad value is
 * never swallowed into a misleading date.
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatCardDateTime(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const rawHours = d.getHours();
  const hours = rawHours % 12 || 12;
  const minutes = pad2(d.getMinutes());
  const meridiem = rawHours >= 12 ? 'PM' : 'AM';
  return `${day}/${month}/${year} ${hours}:${minutes} ${meridiem}`;
}

/**
 * Friendly date-only "DD/MM/YYYY" for values that carry no meaningful time-of-day — a task due
 * date, for instance. A bare `YYYY-MM-DD` is reformatted from its own digits (never via `new Date`),
 * so it can't drift a day when the viewer is behind UTC and midnight parses to the previous evening.
 * Anything with more than a date (a full ISO timestamp) is parsed and shown in local time; '—' for an
 * empty value and the original string for anything unparseable, same contract as formatCardDateTime.
 */
export function formatCardDate(value: string | undefined): string {
  if (!value) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${day}/${month}/${year}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
