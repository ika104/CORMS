/**
 * CMS-008 — pure logic for manually declaring a draft as a final, immutable record. Kept free of
 * React/service dependencies so the approval-complete gate (AC1), the immutability rule (AC2), the
 * external-delivery guard (AC4) and the record-serial format (AC7) are unit-testable on their own.
 */

import { CorrespondenceStatus } from '../../models/ICorrespondence';
import { ICorrespondenceDetail, IDeclarationResult } from '../../models/ICorrespondenceDetail';

export { formatRecordSerial } from '../../services/common/recordSerial';

/** AC1 — a draft can only be declared once the approval workflow (CMS-006) is fully completed:
 * the correspondence has reached 'Approved' (whole chain approved) or 'Signed'. Already-declared
 * or delivered items are not re-declarable. */
export function canDeclare(status: CorrespondenceStatus): boolean {
  return status === 'Approved' || status === 'Signed';
}

/** AC2 — once declared (or delivered), the correspondence and its attachments are frozen: no field
 * edits are permitted. Editing gates combine this with the caller's own permission check. */
export function isImmutable(status: CorrespondenceStatus): boolean {
  return status === 'Declared' || status === 'Delivered';
}

/** AC4 — an undeclared draft cannot be delivered to external parties; delivery is only permitted
 * once the record is declared (or already delivered). */
export function canDeliverExternally(status: CorrespondenceStatus): boolean {
  return status === 'Declared' || status === 'Delivered';
}

/** Applies a declaration result onto the detail: status becomes 'Declared' and the attribution,
 * timestamp and serial are stamped (AC2/AC3/AC7). Returns a new object (never mutates). */
export function applyDeclaration(detail: ICorrespondenceDetail, result: IDeclarationResult): ICorrespondenceDetail {
  return {
    ...detail,
    status: 'Declared',
    declaredBy: result.declaredBy,
    declaredAt: result.declaredAt,
    recordSerialNumber: result.recordSerialNumber,
    recordClassificationName: result.recordClassification ?? detail.recordClassificationName,
  };
}
