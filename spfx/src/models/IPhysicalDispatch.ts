/**
 * The physical-mail dispatch details captured by the Create Correspondence "Physical Mail" wizard
 * (CMS-020). One of three methods, each with its own fields, plus an optional audit comment. Kept
 * as a single shared shape so the form, the write payload, and the persisted JSON all agree.
 * Aligns with ICorrespondenceDetail's DispatchMethod / delivery-channel fields.
 */
export type PhysicalDispatchMethod = 'Courier' | 'InPerson' | 'Postal';

export interface IPhysicalDispatch {
  method: PhysicalDispatchMethod;
  /** Courier / Express: the courier company name. */
  courier?: string;
  /** Courier / Express: the courier's id (from admin.couriersJson). */
  courierId?: string;
  /** Courier / Express: the CORMS-generated tracking/dispatch reference. */
  trackingRef?: string;
  /** Courier / Express: values for the courier's own configured fields, keyed by field key
   * (e.g. { serviceLevel: 'Next-Day', originHub: 'Muscat' }) — the fields are admin-managed per
   * courier (ICourierConfig), so this stays an open map rather than fixed columns. */
  courierFields?: Record<string, string>;
  /** In-Person / Hand delivery: the bearer/messenger name. */
  bearerName?: string;
  /** In-Person / Hand delivery: delivery date & time (ISO / datetime-local string). */
  bearerDateTime?: string;
  /** Postal Service: the postal service name. */
  postalService?: string;
  /** Postal Service: receipt / reference number (optional). */
  receiptNumber?: string;
  /** Optional note, recorded in the audit trail. */
  comment?: string;
}

/** Parses the stored PhysicalDispatch JSON back into a dispatch object (undefined when blank or
 * malformed) — shared by the write mapper's draft round-trip and the detail read. */
export function parsePhysicalDispatch(raw: string | undefined): IPhysicalDispatch | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as IPhysicalDispatch;
    return parsed && typeof parsed === 'object' && parsed.method ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** True when the chosen method's required fields are filled — the wizard's Submit gate. */
export function isPhysicalDispatchComplete(dispatch: IPhysicalDispatch | undefined): boolean {
  if (!dispatch) return false;
  switch (dispatch.method) {
    case 'Courier':
      return !!dispatch.courier;
    case 'InPerson':
      return !!dispatch.bearerName && !!dispatch.bearerDateTime;
    case 'Postal':
      return !!dispatch.postalService;
    default:
      return false;
  }
}

/** The method's headline detail, for the one-line summary shown under Delivery Options
 * (e.g. "Asyad Express" for a courier, the bearer name, or the postal service). */
export function physicalDispatchDetail(dispatch: IPhysicalDispatch): string {
  switch (dispatch.method) {
    case 'Courier':
      return dispatch.courier ?? '';
    case 'InPerson':
      return dispatch.bearerName ?? '';
    case 'Postal':
      return dispatch.postalService ?? '';
    default:
      return '';
  }
}
