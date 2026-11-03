import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/fields';
import '@pnp/sp/items';
import '@pnp/sp/views';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  IListStatus,
  IProvisioningService,
  IProvisionEvent,
  IProvisionTally,
} from '../interfaces/IProvisioningService';
import { ListSchema } from '../../provisioning/listSchemas';
import { ProvisioningCore } from './provisioningCore';

/**
 * PnPjs-based, idempotent SharePoint list/field/seed-row provisioning (Sprint 1 list-provisioning
 * task). A thin wrapper: it only builds the real PnPjs `SPFI` instance and delegates every ensure
 * step and status call to ProvisioningCore (see provisioningCore.ts for why that logic lives in a
 * separate, @pnp/sp-runtime-free module and for the actual provisioning behavior).
 *
 * Uses @pnp/sp (already a project dependency) rather than the hand-rolled SPHttpClient REST calls
 * the rest of this codebase's *.live.ts services use — deliberate for this service specifically,
 * since PnPjs's fluent list/field API (existence checks, typed field-add methods per field type)
 * is far better suited to generic schema-driven provisioning across many field types than
 * hand-rolled REST would be, and SPFx context already gives it digest/auth handling for free.
 */
export class ProvisioningService implements IProvisioningService {
  private readonly core: ProvisioningCore;

  /**
   * `spOverride` exists only so unit tests can inject a fake SPFI-shaped object without a real
   * SPFx WebPartContext (PnPjs' spfi()/SPFx() need a live page context) — production code always
   * omits it and gets the normal spfi(siteUrl).using(SPFx(context)) instance.
   */
  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new ProvisioningCore(sp);
  }

  public getStatus(schemas: ListSchema[]): Promise<IListStatus[]> {
    return this.core.getStatus(schemas);
  }

  public provisionAll(
    schemas: ListSchema[],
    onEvent: (event: IProvisionEvent) => void
  ): Promise<IProvisionTally> {
    return this.core.provisionAll(schemas, onEvent);
  }
}
