import { SPFI } from '@pnp/sp';
import { ProvisioningCore } from '../provisioningCore';
import { IProvisionEvent } from '../../interfaces/IProvisioningService';
import {
  CORMS_ADMIN_CONFIG_SCHEMA,
  CORMS_ATTACHMENTS_SCHEMA,
  CORMS_TASKS_SCHEMA,
  CORMS_TIMELINE_SCHEMA,
  ListSchema,
  SCHEMAS,
} from '../../../provisioning/listSchemas';

/**
 * A minimal in-memory stand-in for PnPjs' SPFI fluent surface — just enough of
 * web.lists/.fields/.items (getByTitle/add/filter/top/select/update, and the 404-on-missing
 * behavior via a thrown `{ status: 404 }`) for ProvisioningCore's ensure* steps to run against,
 * without a real SPFx WebPartContext or network. Not a general-purpose PnPjs mock. Exercises
 * ProvisioningCore directly (not the ProvisioningService wrapper) since @pnp/sp itself can't be
 * imported into a Jest test in this project — see provisioningCore.ts's file comment.
 */
interface IFakeList {
  fields: Record<string, Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  defaultViewFields: string[];
  /** Call counters for asserting provisioning doesn't hit the view more than necessary. */
  viewFieldReads: number;
  viewMutations: number;
}

interface IFakeSite {
  lists: Record<string, IFakeList>;
  /** Records the BaseTemplate each list was created with, keyed by title. */
  createdWithTemplate: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeQueryable = any;

function matchesFilter(expr: string | undefined, item: Record<string, unknown>): boolean {
  if (!expr) return true;
  const m = /^(\w+) eq '(.*)'$/.exec(expr);
  if (!m) return true;
  const [, field, rawValue] = m;
  const value = rawValue.replace(/''/g, "'");
  return item[field] === value;
}

function createChainable(getData: () => Array<Record<string, unknown>>): FakeQueryable {
  let filterExpr: string | undefined;
  let topN: number | undefined;
  const fn: FakeQueryable = (): Promise<Array<Record<string, unknown>>> => {
    let data = getData().filter((item) => matchesFilter(filterExpr, item));
    if (topN !== undefined) data = data.slice(0, topN);
    return Promise.resolve(data);
  };
  fn.filter = (expr: string): FakeQueryable => {
    filterExpr = expr;
    return fn;
  };
  fn.top = (n: number): FakeQueryable => {
    topN = n;
    return fn;
  };
  fn.select = (): FakeQueryable => fn;
  return fn;
}

function getOrCreateList(site: IFakeSite, title: string): IFakeList {
  if (!site.lists[title]) {
    site.lists[title] = {
      fields: {},
      items: [],
      defaultViewFields: [],
      viewFieldReads: 0,
      viewMutations: 0,
    };
  }
  return site.lists[title];
}

function makeViewFieldsCollection(list: IFakeList): FakeQueryable {
  // Invoking this (list.defaultView.fields()) mirrors SP.View.ViewFields' GET response shape.
  const fn: FakeQueryable = (): Promise<{ Items: string[]; SchemaXml: string }> => {
    list.viewFieldReads += 1;
    return Promise.resolve({ Items: list.defaultViewFields.slice(), SchemaXml: '' });
  };
  fn.add = (name: string): Promise<void> => {
    list.viewMutations += 1;
    if (list.defaultViewFields.indexOf(name) === -1) {
      list.defaultViewFields.push(name);
    }
    return Promise.resolve();
  };
  // Mirrors SharePoint's real RemoveViewField: errors when the field isn't currently on the
  // view, rather than silently no-opping the way AddViewField does for an already-added one.
  fn.remove = (name: string): Promise<void> => {
    list.viewMutations += 1;
    const current = list.defaultViewFields.indexOf(name);
    if (current === -1) {
      return Promise.reject(new Error(`Field "${name}" is not on the view`));
    }
    list.defaultViewFields.splice(current, 1);
    return Promise.resolve();
  };
  fn.move = (name: string, index: number): Promise<void> => {
    list.viewMutations += 1;
    const current = list.defaultViewFields.indexOf(name);
    if (current !== -1) {
      list.defaultViewFields.splice(current, 1);
    }
    list.defaultViewFields.splice(index, 0, name);
    return Promise.resolve();
  };
  return fn;
}

function makeDefaultView(list: IFakeList): { fields: FakeQueryable } {
  return { fields: makeViewFieldsCollection(list) };
}

// Mirrors SharePoint's real behavior: a missing field 400s with an
// "...was not found." body (via @pnp/queryable's HttpRequestError), not a clean 404 the way
// a missing list does — see isNotFoundError's comment in provisioningCore.ts.
function fieldNotFoundError(name: string): Error & { status: number } {
  return Object.assign(new Error(`Field with name "${name}" was not found.`), { status: 400 });
}

function makeFieldRef(list: IFakeList, name: string): FakeQueryable {
  const fn = (): Promise<Record<string, unknown>> =>
    list.fields[name] ? Promise.resolve(list.fields[name]) : Promise.reject(fieldNotFoundError(name));
  fn.update = (props: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (!list.fields[name]) return Promise.reject(fieldNotFoundError(name));
    Object.assign(list.fields[name], props);
    return Promise.resolve(list.fields[name]);
  };
  fn.select = (): FakeQueryable => fn;
  return fn;
}

function makeFieldsCollection(list: IFakeList): FakeQueryable {
  const fn = createChainable(() => Object.keys(list.fields).map((key) => list.fields[key]));
  fn.getByTitle = (name: string): FakeQueryable => makeFieldRef(list, name);
  const adder = (
    typeAsString: string
  ): ((name: string, props?: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
    return (name: string, props: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
      list.fields[name] = { Title: name, TypeAsString: typeAsString, ...props };
      return Promise.resolve(list.fields[name]);
    };
  };
  fn.addText = adder('Text');
  fn.addMultilineText = adder('Note');
  fn.addDateTime = adder('DateTime');
  fn.addChoice = adder('Choice');
  fn.addBoolean = adder('Boolean');
  fn.addNumber = adder('Number');
  fn.addUser = adder('User');
  return fn;
}

function makeItemsCollection(list: IFakeList): FakeQueryable {
  const fn = createChainable(() => list.items);
  fn.add = (props: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const item = { Id: list.items.length + 1, ...props };
    list.items.push(item);
    return Promise.resolve(item);
  };
  fn.getById = (id: number): FakeQueryable => ({
    recycle: (): Promise<string> => {
      list.items = list.items.filter((item) => item.Id !== id);
      return Promise.resolve('recycled');
    },
  });
  return fn;
}

function makeListRef(site: IFakeSite, title: string): FakeQueryable {
  const fn = (): Promise<Record<string, unknown>> =>
    site.lists[title] ? Promise.resolve({ Title: title }) : Promise.reject({ status: 404 });
  Object.defineProperty(fn, 'fields', { get: () => makeFieldsCollection(getOrCreateList(site, title)) });
  Object.defineProperty(fn, 'items', { get: () => makeItemsCollection(getOrCreateList(site, title)) });
  Object.defineProperty(fn, 'defaultView', { get: () => makeDefaultView(getOrCreateList(site, title)) });
  return fn;
}

function createFakeSp(site: IFakeSite): SPFI {
  const lists = {
    getByTitle: (title: string): FakeQueryable => makeListRef(site, title),
    add: (title: string, _description?: string, template?: number): Promise<Record<string, unknown>> => {
      if (site.lists[title]) {
        throw new Error(`list already exists: ${title}`);
      }
      site.lists[title] = {
        fields: {},
        items: [],
        defaultViewFields: [],
        viewFieldReads: 0,
        viewMutations: 0,
      };
      site.createdWithTemplate[title] = template ?? 100;
      return Promise.resolve({ Title: title });
    },
  };
  return { web: { lists } } as unknown as SPFI;
}

describe('ProvisioningCore', () => {
  it('re-running provisionAll against the real SCHEMAS creates nothing new and reports everything as already existing', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    const firstEvents: IProvisionEvent[] = [];
    const firstTally = await core.provisionAll(SCHEMAS, (e) => firstEvents.push(e));

    expect(firstTally.errors).toBe(0);
    expect(firstTally.created).toBeGreaterThan(0);
    expect(firstTally.exists).toBe(0);

    // CORMS_Tasks must resolve its title through CORMS_AdminConfig's seeded "Task-List" default,
    // not a hard-coded name — and CORMS_AdminConfig itself must exist (provisioned first).
    expect(site.lists.CORMS_AdminConfig).toBeDefined();
    expect(site.lists.CORMS_Tasks).toBeDefined();
    // Audit cutover: new tenants configure the Elasticsearch audit index and no longer create the
    // retired SharePoint audit list. Existing CORMS_AuditLog lists are intentionally not deleted.
    expect(site.lists.CORMS_AuditLog).toBeUndefined();
    expect(site.lists.CORMS_AdminConfig.items).toContainEqual(
      expect.objectContaining({ Title: 'integration.elasticAuditIndex', Value: 'sslaudit' })
    );

    const adminConfigItemCountAfterFirstRun = site.lists.CORMS_AdminConfig.items.length;

    const secondEvents: IProvisionEvent[] = [];
    const secondTally = await core.provisionAll(SCHEMAS, (e) => secondEvents.push(e));

    expect(secondTally.errors).toBe(0);
    expect(secondTally.created).toBe(0);
    expect(secondTally.exists).toBe(firstTally.created);
    expect(site.lists.CORMS_AdminConfig.items.length).toBe(adminConfigItemCountAfterFirstRun);

    // No SharePoint list gained or lost fields/items across the re-run.
    SCHEMAS.forEach((schema) => {
      const list = site.lists[schema.title];
      expect(Object.keys(list.fields).length).toBeGreaterThanOrEqual(schema.fields.length);
    });
  });

  it('adds every provisioned field to the list\'s default view, so "All Items" shows the new columns', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    const list = site.lists.CORMS_AdminConfig;
    CORMS_ADMIN_CONFIG_SCHEMA.fields.forEach((field) => {
      if (field.name === 'Title') return; // Title is asserted separately below
      expect(list.defaultViewFields).toContain(field.name);
    });
  });

  it('never explicitly adds "Title" to the view, since every view already shows it via LinkTitle and doing so would duplicate the column', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    // CORMS_AdminConfig, CORMS_Correspondence, and CORMS_Tasks all declare Title as a field.
    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    expect(site.lists.CORMS_AdminConfig.defaultViewFields).not.toContain('Title');
  });

  it('removes a duplicate raw "Title" view column left over from a run that predates this fix', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    // Simulate a list already provisioned by an earlier run that explicitly added the raw
    // Title field to the view, duplicating the built-in LinkTitle column.
    site.lists.CORMS_AdminConfig = {
      fields: { Title: { Title: 'Title', TypeAsString: 'Text' } },
      items: [],
      defaultViewFields: ['Title'],
      viewFieldReads: 0,
      viewMutations: 0,
    };

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    expect(site.lists.CORMS_AdminConfig.defaultViewFields).not.toContain('Title');
  });

  it("pins ID as the first column of every list's default view", async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    expect(site.lists.CORMS_AdminConfig.defaultViewFields[0]).toBe('ID');
  });

  it('makes no view-mutation calls on a re-run once the view is already in the desired state', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);
    const list = site.lists.CORMS_AdminConfig;
    const mutationsAfterFirstRun = list.viewMutations;
    expect(mutationsAfterFirstRun).toBeGreaterThan(0); // the first run does have real work to do
    const readsAfterFirstRun = list.viewFieldReads;

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    // Second run: view already matches the desired state, so no further add/remove/move calls —
    // just the one read per list to check.
    expect(list.viewMutations).toBe(mutationsAfterFirstRun);
    expect(list.viewFieldReads).toBe(readsAfterFirstRun + 1);
  });

  it('provisions CORMS_Attachments as a Document Library, not a Generic List, so uploaded files get real document storage', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ATTACHMENTS_SCHEMA], () => undefined);

    expect(site.createdWithTemplate.CORMS_Attachments).toBe(101);
  });

  it('backfills the default view for fields a prior run already created but never added to it', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    // Simulate a list/field left over from before this behavior existed: the field is on the
    // list but was never added to the default view.
    site.lists.CORMS_AdminConfig = {
      fields: { Value: { Title: 'Value', TypeAsString: 'Text' } },
      items: [],
      defaultViewFields: [],
      viewFieldReads: 0,
      viewMutations: 0,
    };

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    expect(site.lists.CORMS_AdminConfig.defaultViewFields).toContain('Value');
  });

  it('never overwrites an existing CORMS_AdminConfig row on re-run, even after it has been edited', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    const masterRow = site.lists.CORMS_AdminConfig.items.filter((i) => i.Title === 'master')[0];
    expect(masterRow.Value).toBe('per-feature');
    masterRow.Value = 'live'; // simulate someone editing this row via the Admin Config UI

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);

    const rowsNamedMaster = site.lists.CORMS_AdminConfig.items.filter((i) => i.Title === 'master');
    expect(rowsNamedMaster.length).toBe(1); // not duplicated
    expect(rowsNamedMaster[0].Value).toBe('live'); // not reset back to the schema default
  });

  it('no longer seeds retired CORMS_AdminConfig rows, recycles them on re-run, and reports nothing once they are gone', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));
    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);
    // Simulate an upgraded site that still carries rows earlier releases seeded.
    site.lists.CORMS_AdminConfig.items.push(
      { Id: 9001, Title: 'signnow.apiToken', Value: 'old-token' },
      { Id: 9002, Title: 'signature.providerApiToken', Value: '' },
      { Id: 9003, Title: 'SendMail', Value: '' }
    );

    const events: IProvisionEvent[] = [];
    const tally = await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], (e) => events.push(e));

    expect(tally.removed).toBe(3);
    expect(tally.errors).toBe(0);
    expect(events.filter((e) => e.status === 'removed').map((e) => e.detail)).toEqual([
      'SendMail',
      'signnow.apiToken',
      'signature.providerApiToken',
    ]);
    const titles = site.lists.CORMS_AdminConfig.items.map((i) => i.Title);
    expect(titles).not.toContain('signnow.apiToken');
    expect(titles).not.toContain('signature.providerApiToken');
    expect(titles).not.toContain('SendMail');
    expect(titles).not.toContain('RH_SecurityPermission');
    expect(titles).not.toContain('GroupDocs_Preview_License_Key');
    expect(titles).toEqual(
      expect.arrayContaining([
        'signature.flowUrl',
        'signature.providerBaseUrl',
        'signature.providerClientCredentials',
        'signature.providerUsername',
        'signature.providerPassword',
      ])
    );

    const rerun = await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);
    expect(rerun.removed).toBe(0);
  });

  it("appends new choices to an existing Choice field without dropping the site's own values", async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));
    await core.provisionAll([CORMS_TIMELINE_SCHEMA], () => undefined);
    // Simulate a site provisioned before 'Rejected' existed, with a value added by hand.
    site.lists.CORMS_Timeline.fields.EventType.Choices = ['Created', 'Approved', 'Custom'];

    await core.provisionAll([CORMS_TIMELINE_SCHEMA], () => undefined);

    const choices = site.lists.CORMS_Timeline.fields.EventType.Choices as string[];
    expect(choices.slice(0, 3)).toEqual(['Created', 'Approved', 'Custom']);
    expect(choices).toContain('Rejected');
    expect(choices.filter((c) => c === 'Approved')).toHaveLength(1);
  });

  it('honors an existing CORMS_AdminConfig "Task-List" value instead of creating a duplicate CORMS_Tasks list', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    // Simulate CORMS_AdminConfig already provisioned, with Task-List pointing at a list the
    // Power Apps team already created under a different name.
    site.lists.CORMS_AdminConfig = {
      fields: {},
      items: [
        {
          Id: 1,
          Title: 'Task-List',
          Value: 'CORMS_MyTasks',
          Description: '',
          Category: 'General',
          IsSecret: false,
        },
      ],
      defaultViewFields: [],
      viewFieldReads: 0,
      viewMutations: 0,
    };
    const core = new ProvisioningCore(createFakeSp(site));

    const events: IProvisionEvent[] = [];
    await core.provisionAll([CORMS_TASKS_SCHEMA], (e) => events.push(e));

    expect(site.lists.CORMS_MyTasks).toBeDefined();
    expect(site.lists.CORMS_Tasks).toBeUndefined();
    const listEvent = events.filter((e) => e.step === 'list')[0];
    expect(listEvent.detail).toBe('CORMS_MyTasks');
  });

  it('provisions the CMS-002 quality-gate fields on CORMS_Attachments idempotently (Create Correspondence backend task, Part 0)', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ATTACHMENTS_SCHEMA], () => undefined);
    const firstRunFieldCount = Object.keys(site.lists.CORMS_Attachments.fields).length;

    [
      'ScannedDPI',
      'IsQualityOverridden',
      'QualityOverrideReason',
      'QualityOverriddenBy',
      'QualityOverriddenAt',
    ].forEach((name) => {
      expect(site.lists.CORMS_Attachments.fields[name]).toBeDefined();
    });
    expect(site.lists.CORMS_Attachments.fields.IsQualityOverridden.TypeAsString).toBe('Boolean');

    await core.provisionAll([CORMS_ATTACHMENTS_SCHEMA], () => undefined);
    expect(Object.keys(site.lists.CORMS_Attachments.fields).length).toBe(firstRunFieldCount);
  });

  it('seeds Dynamsoft_License_Key (secret, empty) and app.correspondenceDataSource (default mock) into CORMS_AdminConfig idempotently (Create Correspondence backend task, Part 0)', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const core = new ProvisioningCore(createFakeSp(site));

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);
    const itemCountAfterFirstRun = site.lists.CORMS_AdminConfig.items.length;

    const dynamsoftRow = site.lists.CORMS_AdminConfig.items.filter(
      (i) => i.Title === 'Dynamsoft_License_Key'
    )[0];
    expect(dynamsoftRow.Value).toBe('');
    expect(dynamsoftRow.IsSecret).toBe(true);
    expect(dynamsoftRow.Category).toBe('Integration');

    const toggleRow = site.lists.CORMS_AdminConfig.items.filter(
      (i) => i.Title === 'app.correspondenceDataSource'
    )[0];
    expect(toggleRow.Value).toBe('mock');
    expect(toggleRow.Category).toBe('DataSource');
    expect(toggleRow.IsSecret).toBe(false);

    await core.provisionAll([CORMS_ADMIN_CONFIG_SCHEMA], () => undefined);
    expect(site.lists.CORMS_AdminConfig.items.length).toBe(itemCountAfterFirstRun);
  });

  it('continues provisioning other schemas when one schema fails, and reports the error', async () => {
    const site: IFakeSite = { lists: {}, createdWithTemplate: {} };
    const fakeSp = createFakeSp(site);
    // Force the very first list's existence check to throw a non-404 error.
    const originalGetByTitle = (fakeSp.web.lists as unknown as { getByTitle: (t: string) => FakeQueryable })
      .getByTitle;
    let calls = 0;
    (fakeSp.web.lists as unknown as { getByTitle: (t: string) => FakeQueryable }).getByTitle = (
      title: string
    ) => {
      calls += 1;
      if (calls === 1) {
        return () => Promise.reject(new Error('simulated network failure'));
      }
      return originalGetByTitle(title);
    };

    const brokenSchema: ListSchema = {
      title: 'CORMS_Broken',
      description: 'x',
      fields: [{ name: 'Title', type: 'Text' }],
    };
    const okSchema: ListSchema = {
      title: 'CORMS_Ok',
      description: 'x',
      fields: [{ name: 'Title', type: 'Text' }],
    };
    const core = new ProvisioningCore(fakeSp);

    const tally = await core.provisionAll([brokenSchema, okSchema], () => undefined);

    expect(tally.errors).toBe(1);
    expect(tally.created).toBeGreaterThan(0); // CORMS_Ok still got provisioned
    expect(site.lists.CORMS_Ok).toBeDefined();
    expect(site.lists.CORMS_Broken).toBeUndefined();
  });
});
