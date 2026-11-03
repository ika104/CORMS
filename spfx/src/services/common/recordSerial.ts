/**
 * CMS-008 AC7 — the record serial number stamped on a correspondence when it is declared as a
 * final record, for filing and retrieval: REC-{year}-{6-digit sequence}. Lives in services/common
 * so both the write services (mock counter, live item id) and the module's declaration logic share
 * one format without a service→module dependency.
 */
export function formatRecordSerial(year: number, sequence: number): string {
  return `REC-${year}-${String(sequence).padStart(6, '0')}`;
}
