/**
 * Single quotes are the only character that needs escaping inside an OData literal string.
 * Mirrors provisioningCore.ts's private helper of the same name/behavior — duplicated rather than
 * imported so every Epic 1 live service's Core class stays free of any dependency on the
 * provisioning module, which is a separate, unrelated concern.
 */
export function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * SharePoint REST has no `in` operator, so multi-value membership is always expressed as an
 * OR-of-eq group — `Field eq 'a' or Field eq 'b'`. Callers wrap the result in parentheses when
 * ANDing it with anything else.
 *
 * Shared by ReadReceiptServiceCore and SubordinateInboxServiceCore (both key CORMS_ReadReceipts by
 * CorrespondenceId) and DelegationServiceCore (CORMS_DelegationAttachments by DelegationId), so the
 * one convention has one implementation instead of a private copy per Core class.
 */
export function idInClause(field: string, values: string[]): string {
  return values.map((v) => `${field} eq '${escapeODataLiteral(v)}'`).join(' or ');
}

/**
 * SharePoint REST datetime literal, e.g. datetime'2026-01-01T00:00:00Z'.
 *
 * Milliseconds are trimmed: a literal carrying them (the shape `new Date().toISOString()` produces)
 * is rejected by SharePoint with a 400, and the fake-PnPjs harness's lexical string compare happens
 * to still sort it correctly, so the suite does not catch it on its own — see buildTaskFilter.ts,
 * where that exact bug was found and fixed once already.
 */
export function odataDateTimeLiteral(iso: string): string {
  return `datetime'${iso.replace(/\.\d+Z$/, 'Z')}'`;
}
