// TODO(backend): wire to the real signing action from CMS-048's step/clearance rules. Shared by
// InboxSentView's row/card signature control and the correspondence detail view's Signature
// action so both paths produce the identical result (CMS-047 AC: the two must not diverge).

/** No identity/authority service is wired yet (mock mode) — every user can attempt to sign. */
export function canSignCorrespondence(): boolean {
  return true;
}

export function applySignature<T extends { isSigned?: boolean }>(item: T): T {
  return { ...item, isSigned: true };
}
