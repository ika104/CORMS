import { ListSchema } from '../../provisioning/listSchemas';

export type ProvisionStepKind = 'list' | 'field' | 'seedRow' | 'view';
export type ProvisionStatus = 'created' | 'exists' | 'removed' | 'error';

/** One provisioning step's outcome, streamed live to the UI as provisionAll()/provisionOne() run. */
export interface IProvisionEvent {
  schemaTitle: string;
  step: ProvisionStepKind;
  /** Field name, seed-row key, or the list title itself (step === 'list'). */
  detail: string;
  status: ProvisionStatus;
  /** Present only when status === 'error'. */
  error?: string;
}

export interface IProvisionTally {
  created: number;
  exists: number;
  /** Retired seed rows moved to the recycle bin (see ListSchema.retiredSeedRows). */
  removed: number;
  errors: number;
}

/** Per-schema existence snapshot used by the Provision Lists screen's summary table, computed
 * without changing anything on the site (read-only, safe to call any time). */
export interface IListStatus {
  schemaTitle: string;
  /** The list's actual title on the site — differs from schemaTitle only for schemas with a
   * resolveTitle hook (CORMS_Tasks honors the CORMS_AdminConfig "Task-List" key). */
  resolvedTitle: string;
  exists: boolean;
  fieldCount: number;
  expectedFieldCount: number;
}

/**
 * Idempotent SharePoint list/field/seed-row provisioning, driven entirely by the ListSchema[]
 * defined in src/provisioning/listSchemas.ts (Sprint 1 list-provisioning task). Every check-then-act
 * step is safe to re-run: existing lists/fields/rows are never duplicated or overwritten.
 */
export interface IProvisioningService {
  /** Read-only existence/field-count check for the summary table — makes no site changes. */
  getStatus(schemas: ListSchema[]): Promise<IListStatus[]>;
  /**
   * Provisions every schema in order (list -> fields -> seed rows), invoking onEvent once per
   * step as it completes so the caller can stream a live log, then resolves to the final tally.
   * One schema's failure does not abort the others — continue and report the error via onEvent.
   *
   * A callback (rather than an async generator) is deliberate: this project's TypeScript target
   * is ES5 without the ES2018 async-iterable lib, so `AsyncGenerator`/`for await` are unavailable
   * here — matches the plain async/Promise style already used by every other service in the
   * codebase.
   */
  provisionAll(schemas: ListSchema[], onEvent: (event: IProvisionEvent) => void): Promise<IProvisionTally>;
}
