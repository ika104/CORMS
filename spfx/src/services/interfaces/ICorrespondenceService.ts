import { ICreateCorrespondencePayload, ICreateCorrespondenceResult, IDraftEditData } from '../../models/ICorrespondencePayload';
import { IAwaitedParty } from '../../models/ICorrespondence';

/** CMS-014 — the awaited party + who flagged it, persisted alongside the flag so the escalation
 * deadline (AC4) can be evaluated server-side. */
export interface IPendingResponseFlag {
  awaitedParty: IAwaitedParty;
  actor: string;
}

// Create Correspondence backend task (CMS-001) — the single write entry point the Create
// Correspondence screen's Save Draft and Send buttons both call. Always live, no ds.* mock/live
// toggle — CORMS owns CORMS_Correspondence outright, same "Epic 1, always live" convention as
// ICorrespondenceListService/ICorrespondenceDetailService.
export interface ICorrespondenceService {
  create(
    payload: ICreateCorrespondencePayload,
    mode: 'draft' | 'submit'
  ): Promise<ICreateCorrespondenceResult>;

  /** Reads a saved draft's persisted fields so the Create Correspondence screen can reopen it in
   * edit mode — the user can then keep editing (Save Draft) or submit it (Send). Returns undefined
   * if the id doesn't resolve to a row. */
  getDraftForEdit(id: string): Promise<IDraftEditData | undefined>;

  /** Persists a correspondence's pending-response flag (CMS-014). When `pending` is true, `flag`
   * carries the awaited party + actor, stamped with the flag time so the escalation deadline (AC4)
   * can be evaluated; when false the flag and its detail are cleared. CMS-022 AC7 clears it
   * automatically when a linked reply is submitted; this backs the manual Flag/Clear actions. */
  setPendingResponse(id: string, pending: boolean, flag?: IPendingResponseFlag): Promise<void>;
}
