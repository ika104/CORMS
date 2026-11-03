export type DetailTab =
  | 'preview'
  | 'annotate'
  | 'details'
  | 'files'
  | 'file'
  | 'security'
  | 'audit'
  | 'timeline'
  | 'thread'
  | 'reminder'
  | 'approvals';

/** Router state the entry points (list "…" menus, row clicks, Thread tab) pass in. */
export interface IDetailNavState {
  tab?: DetailTab;
  /** When true, auto-opens the Share Link modal on load — used by the "Share Link" row action so it
   * behaves like the detail header's Share action rather than just landing on the Details tab. */
  openShare?: boolean;
  /** Path to return to via the "← Back to …" link — defaults to My Correspondence. */
  originPath?: string;
  /** Already-localized origin list name shown in the back link (e.g. a user's own folder name isn't an i18n key). */
  originLabel?: string;
}
