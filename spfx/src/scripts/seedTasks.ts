import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/fields';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ISeedTasksResult, ISeedTasksService } from '../services/interfaces/ISeedTasksService';
import { SeedTasksCore } from './seedTasksCore';

/**
 * "Seed Sample Tasks" (Part 5) — thin real wrapper, same split as ProvisioningService/
 * ProvisioningCore: only builds the real PnPjs SPFI instance and delegates to SeedTasksCore.
 * Exposed as its own action on the Provision Lists admin screen (ProvisionListsPanel.tsx),
 * unambiguously separate from "Create / Update All Lists" — this never creates or modifies list
 * structure, only inserts idempotent sample rows into a schema it has already confirmed exists.
 *
 * TODO(confirm): if a pure standalone/console-run script (no UI button) was intended instead of
 * this admin-screen action, this can be split out trivially — implemented as a screen action for
 * consistency with the rest of the admin tooling and because it's easier to re-run during testing.
 */
export class SeedTasksService implements ISeedTasksService {
  private readonly core: SeedTasksCore;

  /** `spOverride` exists only so unit tests can inject a fake SPFI-shaped object — same pattern as
   * ProvisioningService. */
  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new SeedTasksCore(sp);
  }

  public run(): Promise<ISeedTasksResult> {
    return this.core.run();
  }
}
