import type { SPFI } from '@pnp/sp';
import type { IList } from '@pnp/sp/lists';
// Type-only: brings IList's `.defaultView` augmentation into scope (from @pnp/sp/views/list.d.ts)
// without a runtime import — erased at compile time per this file's `importsNotUsedAsValues:
// "remove"` (see the class doc comment on why @pnp/sp itself must never load here).
// ProvisioningService.ts is the one that actually `import '@pnp/sp/views'`s at runtime.
import type {} from '@pnp/sp/views';
import {
  IListStatus,
  IProvisionEvent,
  IProvisionTally,
  ProvisionStatus,
} from '../interfaces/IProvisioningService';
import { CORMS_ADMIN_CONFIG_SCHEMA, FieldSchema, ListSchema, SeedRow } from '../../provisioning/listSchemas';

interface IStepResult {
  status: ProvisionStatus;
  error?: string;
}

function isNotFoundError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 404) {
    return true;
  }
  // SharePoint's Fields endpoint doesn't 404 for a missing field the way Lists does — it
  // responds 400 System.ArgumentException with a "Field with name \"X\" was not found." body,
  // which @pnp/queryable surfaces as HttpRequestError.status === 400 with that text in .message.
  // Without this, ensureFieldStep mistakes every missing field for a real error and never
  // creates it.
  if (status === 400) {
    const message = err instanceof Error ? err.message : String(err);
    return /was not found/i.test(message);
  }
  return false;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// Single quotes are the only character that needs escaping inside an OData literal string.
function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * The idempotent list/field/seed-row provisioning logic (Sprint 1 list-provisioning task),
 * factored out of ProvisioningService.ts so it can be unit tested without pulling in @pnp/sp at
 * module-load time — @pnp/sp ships ESM-only and this project's Jest runtime (which runs the
 * TypeScript-compiled CommonJS output, not source, and deliberately skips transforming .js/.cjs —
 * see @rushstack/heft-jest-plugin's shared config) cannot `require()` it. Only *types* are
 * imported here (`import type`, erased at compile time per this project's
 * `importsNotUsedAsValues: "remove"`), never the real `spfi`/`SPFx` functions — those live only in
 * ProvisioningService.ts, the thin wrapper that actually touches SharePoint.
 *
 * Driven entirely by the ListSchema[] passed in (see src/provisioning/listSchemas.ts) — this class
 * has no list-specific knowledge of its own. Every ensure* step checks existence first and only
 * issues a write when something is actually missing, so re-running provisionAll() is always safe:
 * no duplicate lists, no duplicate fields, no duplicate/overwritten seed rows.
 */
export class ProvisioningCore {
  constructor(private readonly sp: SPFI) {}

  public async getStatus(schemas: ListSchema[]): Promise<IListStatus[]> {
    const results: IListStatus[] = [];
    for (const schema of schemas) {
      const resolvedTitle = await this.resolveTitle(schema);
      const expectedFieldCount = schema.fields.length;
      try {
        const fields = await this.sp.web.lists.getByTitle(resolvedTitle).fields.select('Title')();
        const existingNames = new Set((fields as Array<{ Title: string }>).map((f) => f.Title));
        const fieldCount = schema.fields.filter((f) => existingNames.has(f.name)).length;
        results.push({
          schemaTitle: schema.title,
          resolvedTitle,
          exists: true,
          fieldCount,
          expectedFieldCount,
        });
      } catch {
        // Any failure to read the list back (not found, or an unexpected error) is reported as
        // "not created" here — the Provision button surfaces the real error when it actually runs.
        results.push({
          schemaTitle: schema.title,
          resolvedTitle,
          exists: false,
          fieldCount: 0,
          expectedFieldCount,
        });
      }
    }
    return results;
  }

  public async provisionAll(
    schemas: ListSchema[],
    onEvent: (event: IProvisionEvent) => void
  ): Promise<IProvisionTally> {
    const tally: IProvisionTally = { created: 0, exists: 0, removed: 0, errors: 0 };

    for (const schema of schemas) {
      const resolvedTitle = await this.resolveTitle(schema);

      const listResult = await this.ensureListStep(schema, resolvedTitle);
      onEvent({
        schemaTitle: schema.title,
        step: 'list',
        detail: resolvedTitle,
        status: listResult.status,
        error: listResult.error,
      });
      this.tally(tally, listResult.status);

      if (listResult.status === 'error') {
        // Can't provision fields/seed rows without a valid list reference — move on to the next
        // schema rather than aborting the whole run (Part 3: one list's failure must not abort
        // the others).
        continue;
      }

      const list = this.sp.web.lists.getByTitle(resolvedTitle);

      // Fetched once per list (not once per field) and mutated in place as fields/ID are
      // added/removed/moved below, so every AddViewField/RemoveViewField/move call is only
      // issued when the view genuinely isn't already in the desired state yet — a no-op re-run
      // makes zero view-mutation requests, just this one read.
      const viewFieldOrder = await this.getViewFieldOrder(list);

      for (const field of schema.fields) {
        const fieldResult = await this.ensureFieldStep(list, field, viewFieldOrder);
        onEvent({
          schemaTitle: schema.title,
          step: 'field',
          detail: field.name,
          status: fieldResult.status,
          error: fieldResult.error,
        });
        this.tally(tally, fieldResult.status);
      }

      // Idempotently pinning ID first has no meaningful created-vs-existing distinction (unlike
      // list/field/seedRow, it doesn't leave anything unchanged to report as "existing" on a
      // repeat run), so it's surfaced via onEvent for log visibility but only counted in the
      // tally when it actually errors — unaffected first-run/re-run tallies stay comparable.
      const viewResult = await this.ensureIdColumnFirstStep(list, viewFieldOrder);
      onEvent({
        schemaTitle: schema.title,
        step: 'view',
        detail: 'ID',
        status: viewResult.status,
        error: viewResult.error,
      });
      if (viewResult.status === 'error') {
        this.tally(tally, viewResult.status);
      }

      const matchOn = schema.seedMatchOn ?? 'Title';
      for (const row of schema.seedRows ?? []) {
        const rowResult = await this.ensureSeedRowStep(list, row, matchOn);
        onEvent({
          schemaTitle: schema.title,
          step: 'seedRow',
          detail: String(row[matchOn]),
          status: rowResult.status,
          error: rowResult.error,
        });
        this.tally(tally, rowResult.status);
      }

      // Only rows actually found are reported, so a clean re-run logs nothing for retired keys.
      for (const retiredValue of schema.retiredSeedRows ?? []) {
        const retireResult = await this.retireSeedRowStep(list, retiredValue, matchOn);
        if (!retireResult) continue;
        onEvent({
          schemaTitle: schema.title,
          step: 'seedRow',
          detail: retiredValue,
          status: retireResult.status,
          error: retireResult.error,
        });
        this.tally(tally, retireResult.status);
      }
    }

    return tally;
  }

  private tally(t: IProvisionTally, status: ProvisionStatus): void {
    if (status === 'created') t.created += 1;
    else if (status === 'exists') t.exists += 1;
    else if (status === 'removed') t.removed += 1;
    else t.errors += 1;
  }

  private async resolveTitle(schema: ListSchema): Promise<string> {
    if (!schema.resolveTitle) {
      return schema.title;
    }
    try {
      return await schema.resolveTitle({ readAdminConfigValue: (key) => this.readAdminConfigValue(key) });
    } catch {
      return schema.title;
    }
  }

  private async readAdminConfigValue(key: string): Promise<string | undefined> {
    try {
      const items = await this.sp.web.lists
        .getByTitle(CORMS_ADMIN_CONFIG_SCHEMA.title)
        .items.filter(`Title eq '${escapeODataLiteral(key)}'`)
        .top(1)
        .select('Value')();
      const value = (items as Array<{ Value?: string }>)[0]?.Value;
      return value;
    } catch {
      return undefined;
    }
  }

  private async ensureListStep(schema: ListSchema, resolvedTitle: string): Promise<IStepResult> {
    try {
      await this.sp.web.lists.getByTitle(resolvedTitle)();
      return { status: 'exists' };
    } catch (err) {
      if (!isNotFoundError(err)) {
        return { status: 'error', error: describeError(err) };
      }
    }
    try {
      await this.sp.web.lists.add(resolvedTitle, schema.description, schema.template ?? 100, false);
      return { status: 'created' };
    } catch (err) {
      return { status: 'error', error: describeError(err) };
    }
  }

  // The view's current field order, read once per list in provisionAll() and passed down here
  // (and to ensureIdColumnFirstStep) so every AddViewField/RemoveViewField/move call below is
  // only issued when the view genuinely isn't already in the desired state — re-running
  // provisioning against a fully set-up list makes no view-mutation requests, only the one read.
  private async getViewFieldOrder(list: IList): Promise<string[]> {
    try {
      const result = await list.defaultView.fields();
      return (result.Items ?? []).slice();
    } catch {
      // Can't read the view — fields/seed rows still get provisioned; view membership just isn't
      // checked or fixed this run rather than blocking everything else.
      return [];
    }
  }

  private async ensureFieldStep(
    list: IList,
    field: FieldSchema,
    viewFieldOrder: string[]
  ): Promise<IStepResult> {
    let existed = true;
    try {
      await list.fields.getByTitle(field.name)();
    } catch (err) {
      if (!isNotFoundError(err)) {
        return { status: 'error', error: describeError(err) };
      }
      existed = false;
    }

    if (!existed) {
      try {
        await this.addField(list, field);
      } catch (err) {
        return { status: 'error', error: describeError(err) };
      }
    }

    // Indexed/DefaultValue are applied best-effort regardless of create-vs-existing: setting an
    // index or a default is a metadata-only change that never touches existing item data, so it's
    // safe to (re)apply on every run rather than only at creation time. Failures here (e.g. a
    // field type that can't be indexed) don't downgrade the field's own created/exists status.
    if (field.indexed) {
      await list.fields
        .getByTitle(field.name)
        .update({ Indexed: true })
        .catch(() => undefined);
    }
    // A multi-person field must carry this setting on an existing field too: many CORMS sites
    // already have CORMS_Tasks before provisioning is re-run, and addUser() is not called then.
    if (field.type === 'User' && field.allowMultiple) {
      await list.fields
        .getByTitle(field.name)
        .update({ AllowMultipleValues: true })
        .catch(() => undefined);
    }
    // A Choice field gains values over time (e.g. a new timeline event type). Append the ones an
    // existing field lacks, never removing or reordering what the site already has.
    if (existed && field.type === 'Choice' && field.choices) {
      await this.addMissingChoices(list, field.name, field.choices).catch(() => undefined);
    }
    if (!existed && field.defaultValue !== undefined) {
      const value =
        typeof field.defaultValue === 'boolean'
          ? field.defaultValue
            ? '1'
            : '0'
          : String(field.defaultValue);
      await list.fields
        .getByTitle(field.name)
        .update({ DefaultValue: value })
        .catch(() => undefined);
    }

    // Creating a field never puts it on the "All Items" view by itself — that's a separate
    // AddViewField call. viewFieldOrder (read once per list, see getViewFieldOrder) says whether
    // it's already there, so this only calls out to SharePoint when the view actually needs to
    // change — not on every pass regardless of current state.
    // Every SharePoint view already renders "Title" via its own linked-title pseudo-column
    // (LinkTitle), so AddViewField('Title') doesn't replace that — it adds a second, unlinked
    // "Title" column next to it. Several schemas declare Title as one of their fields (CMS's own
    // display field, matching SharePoint's built-in column), so it's actively removed if present
    // (cleaning up a duplicate a run before this behavior existed may have added) rather than
    // ever added.
    const viewIndex = viewFieldOrder.indexOf(field.name);
    if (field.name === 'Title') {
      if (viewIndex !== -1) {
        await list.defaultView.fields.remove('Title').catch(() => undefined);
        viewFieldOrder.splice(viewIndex, 1);
      }
    } else if (viewIndex === -1) {
      await list.defaultView.fields.add(field.name).catch(() => undefined);
      viewFieldOrder.push(field.name);
    }

    return { status: existed ? 'exists' : 'created' };
  }

  private async addMissingChoices(list: IList, fieldName: string, choices: string[]): Promise<void> {
    const current = (await list.fields.getByTitle(fieldName).select('Choices')()) as { Choices?: string[] };
    const existing = current.Choices ?? [];
    const missing = choices.filter((choice) => existing.indexOf(choice) === -1);
    if (missing.length === 0) return;
    await list.fields.getByTitle(fieldName).update({ Choices: existing.concat(missing) }, 'SP.FieldChoice');
  }

  private async addField(list: IList, field: FieldSchema): Promise<void> {
    const base = { Indexed: field.indexed ?? false, Required: field.required ?? false };
    switch (field.type) {
      case 'Text':
        await list.fields.addText(field.name, base);
        return;
      case 'Note':
        await list.fields.addMultilineText(field.name, { ...base, NumberOfLines: 6, RichText: false });
        return;
      case 'DateTime':
        await list.fields.addDateTime(field.name, base);
        return;
      case 'Choice':
        await list.fields.addChoice(field.name, { ...base, Choices: field.choices ?? [] });
        return;
      case 'Boolean':
        await list.fields.addBoolean(field.name, base);
        return;
      case 'Number':
        await list.fields.addNumber(field.name, base);
        return;
      case 'User':
        // PnP's addUser() type does not expose SharePoint's AllowMultipleValues property. The
        // ensureFieldStep update above applies it immediately after creation (and on existing
        // fields), which is also necessary for already-provisioned tenant lists.
        await list.fields.addUser(field.name, base);
        return;
      default:
        throw new Error(`Unsupported field type: ${field.type as string}`);
    }
  }

  // "All Items" doesn't show the SharePoint ID column by default, and even once added it lands
  // wherever AddViewField happened to append it — so this runs once per list, after all custom
  // fields are ensured, to guarantee ID is present and pinned as the first column. Reported as
  // its own event (rather than folded silently into the field loop, unlike the per-field
  // AddViewField call above) so a real failure here — e.g. a permissions gap — is visible in the
  // log instead of silently leaving columns unreordered. Checks viewFieldOrder first the same way
  // ensureFieldStep does, so a list where ID is already pinned makes no view-mutation requests.
  private async ensureIdColumnFirstStep(list: IList, viewFieldOrder: string[]): Promise<IStepResult> {
    try {
      if (viewFieldOrder.indexOf('ID') === -1) {
        await list.defaultView.fields.add('ID');
        viewFieldOrder.push('ID');
      }
      if (viewFieldOrder[0] !== 'ID') {
        await list.defaultView.fields.move('ID', 0);
        viewFieldOrder.splice(viewFieldOrder.indexOf('ID'), 1);
        viewFieldOrder.unshift('ID');
      }
      return { status: 'exists' };
    } catch (err) {
      return { status: 'error', error: describeError(err) };
    }
  }

  private async ensureSeedRowStep(list: IList, row: SeedRow, matchOn: string): Promise<IStepResult> {
    const matchValue = String(row[matchOn]);
    try {
      const existing = await list.items.filter(`${matchOn} eq '${escapeODataLiteral(matchValue)}'`).top(1)();
      if ((existing as unknown[]).length > 0) {
        // Never overwrite an existing row's values on re-run, even if edited since — idempotent
        // seeding only inserts, it never updates.
        return { status: 'exists' };
      }
    } catch (err) {
      return { status: 'error', error: describeError(err) };
    }
    try {
      await list.items.add(row);
      return { status: 'created' };
    } catch (err) {
      return { status: 'error', error: describeError(err) };
    }
  }

  // Recycled rather than deleted, so a mistakenly retired value can still be restored from the
  // site recycle bin. Returns undefined when no such row exists (nothing to report).
  private async retireSeedRowStep(
    list: IList,
    matchValue: string,
    matchOn: string
  ): Promise<IStepResult | undefined> {
    try {
      const matches = (await list.items
        .filter(`${matchOn} eq '${escapeODataLiteral(matchValue)}'`)
        .select('Id')()) as Array<{ Id: number }>;
      if (matches.length === 0) return undefined;
      for (const match of matches) {
        await list.items.getById(match.Id).recycle();
      }
      return { status: 'removed' };
    } catch (err) {
      return { status: 'error', error: describeError(err) };
    }
  }
}
