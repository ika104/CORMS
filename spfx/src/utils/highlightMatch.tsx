import * as React from 'react';

/** Wraps every case-insensitive occurrence of `term` in `text` with <mark> (CMS-026's
 * full-text match highlighting) — a plain substring highlight, not a new component. */
export function highlightMatch(text: string, term: string): React.ReactNode {
  const trimmed = term.trim();
  if (!trimmed) return text;
  const lower = text.toLowerCase();
  const needle = trimmed.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle, cursor);
  let key = 0;
  while (index !== -1) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(<mark key={key}>{text.slice(index, index + trimmed.length)}</mark>);
    key += 1;
    cursor = index + trimmed.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
