/**
 * A minimal in-memory stand-in for PnPjs' SPFI fluent surface, purpose-built for Epic 1's Core
 * classes (RoleServiceCore, NavigationServiceCore, CorrespondenceListServiceCore,
 * CorrespondenceDetailServiceCore, CustomFolderServiceCore, ReadReceiptServiceCore,
 * BulkActionsServiceCore) — the same idea as provisioningCore.test.ts's IFakeSite/createFakeSp,
 * generalized to also support items.getById().update(data, etag) with a simulated 412
 * Precondition Failed, and sp.batched() with a real "one execute() = one round trip" model. Not a
 * general-purpose PnPjs mock — only supports the $filter/$select/$expand/$orderBy/$top shapes and
 * write operations these Core classes actually generate.
 */

export interface IFakeRow extends Record<string, unknown> {
  Id: number;
}

interface IInternalRow extends IFakeRow {
  __etag?: number;
}

export interface IFakeList {
  items: IInternalRow[];
  nextId: number;
  /** Field (internal) names, for `.fields.select('Title')()` — used only by
   * ProvisioningCore.getStatus()'s read-only schema-existence check (see seedFields()). Undefined
   * when never seeded via seedFields — distinguished from `[]` (a list seeded with zero fields) so
   * `.fields.select(...)()` can still 404 for a list that was never seeded at all. */
  fieldNames?: string[];
}

export interface IFakeSite {
  lists: Record<string, IFakeList>;
  currentUserId: number;
  /** Member ids of `sp.web.associatedOwnerGroup` — RoleServiceCore's bootstrap-admin fallback
   * checks `currentUserId` against this list. */
  ownerGroupMemberIds: number[];
  /** `sp.web`'s Title, for `sp.web.select('Title')()` — RoleServiceCore's owner-group-by-name
   * fallback ("{Title} Owners") when `associatedOwnerGroup` doesn't resolve one. */
  webTitle: string;
  /** groupName -> member ids, for `sp.web.siteGroups.getByName(name).users.select('Id')()`. See
   * seedNamedGroup(). */
  namedGroups: Record<string, number[]>;
  /** One entry per real HTTP round trip: every non-batched read/write, and exactly one entry per
   * batched execute() regardless of how many operations were queued in it. Tests assert against
   * this to prove batching genuinely reduces round trips. */
  requestLog: string[];
  /** listTitle -> itemId -> role assignment rows, for `.items.getById(id).roleAssignments
   * .expand(...)()`  (CMS-040 Security tab). Only seeded lists/items return anything; unseeded
   * items return an empty array, same "no rows" default as an unseeded list. */
  roleAssignments: Record<string, Record<number, Record<string, unknown>[]>>;
  /** login/claims key -> site user id, for `sp.web.ensureUser(login)`. An unseeded login throws
   * (not-found), matching a real tenant where the account can't be resolved. */
  ensuredUsers?: Record<string, number>;
}

export function createFakeSite(currentUserId = 1, ownerGroupMemberIds: number[] = [], webTitle = 'CORMS'): IFakeSite {
  return { lists: {}, currentUserId, ownerGroupMemberIds, webTitle, namedGroups: {}, requestLog: [], roleAssignments: {}, ensuredUsers: {} };
}

/** Seeds a named site group's membership for `sp.web.siteGroups.getByName(groupName)...` — e.g.
 * `seedNamedGroup(site, 'CORMS Owners', [42])`, RoleServiceCore's fallback when
 * `associatedOwnerGroup` doesn't resolve the Owners group. */
export function seedNamedGroup(site: IFakeSite, groupName: string, memberIds: number[]): void {
  site.namedGroups[groupName] = memberIds.slice();
}

/** Seeds the `.roleAssignments.expand('Member', 'RoleDefinitionBindings')()` result for a single
 * item — e.g. `[{ PrincipalId: 10, Member: { Title: 'Layla Hassan', PrincipalType: 1 },
 * RoleDefinitionBindings: [{ Name: 'Edit' }] }]`. */
export function seedRoleAssignments(site: IFakeSite, listTitle: string, itemId: number, rows: Record<string, unknown>[]): void {
  if (!site.roleAssignments[listTitle]) site.roleAssignments[listTitle] = {};
  site.roleAssignments[listTitle][itemId] = rows.map((r) => ({ ...r }));
}

export function seedList(site: IFakeSite, title: string, rows: IFakeRow[]): void {
  const maxId = rows.reduce((max, r) => Math.max(max, r.Id), 0);
  const existingFieldNames = site.lists[title]?.fieldNames;
  site.lists[title] = { items: rows.map((r) => ({ ...r })), nextId: maxId + 1, fieldNames: existingFieldNames };
}

/** Seeds the field-name list a `.fields.select('Title')()` read returns for `title` — used by
 * ProvisioningCore.getStatus()'s schema-existence check (e.g. SeedTasksCore's verify-before-insert
 * step). Independent of seedList()/the list's rows. */
export function seedFields(site: IFakeSite, title: string, fieldNames: string[]): void {
  if (!site.lists[title]) site.lists[title] = { items: [], nextId: 1, fieldNames: fieldNames.slice() };
  else site.lists[title].fieldNames = fieldNames.slice();
}

function getOrCreateList(site: IFakeSite, title: string): IFakeList {
  if (!site.lists[title]) site.lists[title] = { items: [], nextId: 1 };
  return site.lists[title];
}

function notFoundError(): Error & { status: number } {
  return Object.assign(new Error('Item not found'), { status: 404 });
}

function preconditionFailedError(): Error & { status: number } {
  return Object.assign(new Error('Precondition Failed'), { status: 412 });
}

// ---- $filter evaluator — only the patterns this codebase's query builders generate ----

function unescapeLiteral(v: string): string {
  return v.replace(/''/g, "'");
}

function splitTopLevel(expr: string, separator: 'and' | 'or'): string[] {
  const sep = ` ${separator} `;
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && expr.slice(i, i + sep.length) === sep) {
      parts.push(expr.slice(start, i));
      i += sep.length - 1;
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function stripOuterParens(expr: string): string {
  const t = expr.trim();
  if (t.startsWith('(') && t.endsWith(')')) return t.slice(1, -1);
  return t;
}

// Resolves a possibly-nested field path (e.g. "AssignedToUser/Title", from an $expand'd People/
// Lookup field) against a fake row shaped the way PnPjs/SharePoint REST actually returns expanded
// navigation properties: { AssignedToUser: { Title: 'X' }, ... }.
function getFieldValue(item: IFakeRow, path: string): unknown {
  return path.split('/').reduce<unknown>((acc, segment) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, item);
}

function evalLeaf(item: IFakeRow, clause: string): boolean {
  let m = /^substringof\('(.*)',([\w/]+)\)$/.exec(clause);
  if (m) {
    const [, term, field] = m;
    const value = String(getFieldValue(item, field) ?? '').toLowerCase();
    return value.indexOf(unescapeLiteral(term).toLowerCase()) !== -1;
  }

  m = /^([\w/]+) eq '(.*)'$/.exec(clause);
  if (m) {
    const [, field, value] = m;
    return getFieldValue(item, field) === unescapeLiteral(value);
  }

  m = /^([\w/]+) ne '(.*)'$/.exec(clause);
  if (m) {
    const [, field, value] = m;
    return getFieldValue(item, field) !== unescapeLiteral(value);
  }

  m = /^(\w+) eq (-?\d+)$/.exec(clause);
  if (m) {
    const [, field, value] = m;
    const fieldValue = item[field];
    // SharePoint REST represents Boolean fields as 0/1 in $filter even though the JSON payload
    // itself holds a real boolean — mirror that coercion here rather than the strict `true !== 1`.
    const normalized = typeof fieldValue === 'boolean' ? (fieldValue ? 1 : 0) : fieldValue;
    return normalized === Number(value);
  }

  m = /^(\w+) (ge|le|lt|gt) datetime'(.*)'$/.exec(clause);
  if (m) {
    const [, field, op, value] = m;
    const itemValue = String(item[field] ?? '');
    if (op === 'ge') return itemValue >= value;
    if (op === 'le') return itemValue <= value;
    if (op === 'lt') return itemValue < value;
    return itemValue > value;
  }

  throw new Error(`fakeSp: unsupported filter leaf: "${clause}"`);
}

function evalExpr(item: IFakeRow, expr: string): boolean {
  const stripped = stripOuterParens(expr.trim());
  const andParts = splitTopLevel(stripped, 'and');
  if (andParts.length > 1) return andParts.every((p) => evalExpr(item, p));
  const orParts = splitTopLevel(stripped, 'or');
  if (orParts.length > 1) return orParts.some((p) => evalExpr(item, p));
  return evalLeaf(item, stripped);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeQueryable = any;

function makeItemRef(site: IFakeSite, listTitle: string, id: number, log: (op: string) => void): FakeQueryable {
  const findRow = (): IInternalRow => {
    const list = getOrCreateList(site, listTitle);
    const row = list.items.find((r) => r.Id === id);
    if (!row) throw notFoundError();
    return row;
  };

  const fn: FakeQueryable = async (): Promise<IFakeRow> => {
    log('read');
    const row = findRow();
    return { ...row, 'odata.etag': `"${row.__etag ?? 1}"` };
  };
  fn.select = (..._fields: string[]): FakeQueryable => fn;
  fn.expand = (..._fields: string[]): FakeQueryable => fn;
  fn.update = async (props: Record<string, unknown>, etag?: string): Promise<void> => {
    log('write');
    const row = findRow();
    const currentEtag = `"${row.__etag ?? 1}"`;
    if (etag !== undefined && etag !== currentEtag) {
      throw preconditionFailedError();
    }
    Object.assign(row, props);
    row.__etag = (row.__etag ?? 1) + 1;
  };
  fn.delete = async (): Promise<void> => {
    log('write');
    const list = getOrCreateList(site, listTitle);
    const idx = list.items.findIndex((r) => r.Id === id);
    if (idx !== -1) list.items.splice(idx, 1);
  };
  const roleAssignmentsFn: FakeQueryable = async (): Promise<Record<string, unknown>[]> => {
    log('read');
    return (site.roleAssignments[listTitle]?.[id] ?? []).map((r) => ({ ...r }));
  };
  roleAssignmentsFn.expand = (..._fields: string[]): FakeQueryable => roleAssignmentsFn;
  roleAssignmentsFn.select = (..._fields: string[]): FakeQueryable => roleAssignmentsFn;
  fn.roleAssignments = roleAssignmentsFn;
  return fn;
}

function makeItemsCollection(site: IFakeSite, listTitle: string, log: (op: string) => void): FakeQueryable {
  let filterExpr: string | undefined;
  let topN: number | undefined;
  let orderField: string | undefined;
  let orderAsc = true;

  const fn: FakeQueryable = async (): Promise<IFakeRow[]> => {
    log('read');
    const list = getOrCreateList(site, listTitle);
    let rows = list.items.filter((item) => (filterExpr ? evalExpr(item, filterExpr) : true));
    if (orderField) {
      const field = orderField;
      rows = rows.slice().sort((a, b) => {
        const av = String(a[field] ?? '');
        const bv = String(b[field] ?? '');
        return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (topN !== undefined) rows = rows.slice(0, topN);
    return rows.map((r) => ({ ...r }));
  };
  fn.filter = (expr: string): FakeQueryable => {
    filterExpr = expr;
    return fn;
  };
  fn.select = (..._fields: string[]): FakeQueryable => fn;
  fn.expand = (..._fields: string[]): FakeQueryable => fn;
  fn.orderBy = (field: string, asc = true): FakeQueryable => {
    orderField = field;
    orderAsc = asc;
    return fn;
  };
  fn.top = (n: number): FakeQueryable => {
    topN = n;
    return fn;
  };
  fn.getById = (id: number): FakeQueryable => makeItemRef(site, listTitle, id, log);
  fn.add = async (props: Record<string, unknown>): Promise<IFakeRow> => {
    log('write');
    const list = getOrCreateList(site, listTitle);
    const created: IInternalRow = { Id: list.nextId++, ...props };
    list.items.push(created);
    return { ...created };
  };
  return fn;
}

function makeBatchedSp(site: IFakeSite): [FakeQueryable, () => Promise<void>] {
  const queue: Array<() => void> = [];

  const getByTitle = (title: string): FakeQueryable => ({
    items: {
      getById: (id: number): FakeQueryable => ({
        update: (props: Record<string, unknown>): Promise<void> =>
          new Promise((resolve) => {
            queue.push(() => {
              const list = getOrCreateList(site, title);
              const row = list.items.find((r) => r.Id === id);
              if (row) Object.assign(row, props);
              resolve();
            });
          }),
        delete: (): Promise<void> =>
          new Promise((resolve) => {
            queue.push(() => {
              const list = getOrCreateList(site, title);
              const idx = list.items.findIndex((r) => r.Id === id);
              if (idx !== -1) list.items.splice(idx, 1);
              resolve();
            });
          }),
      }),
      add: (props: Record<string, unknown>): Promise<IFakeRow> =>
        new Promise((resolve) => {
          queue.push(() => {
            const list = getOrCreateList(site, title);
            const created: IInternalRow = { Id: list.nextId++, ...props };
            list.items.push(created);
            resolve({ ...created });
          });
        }),
    },
  });

  const batchedSp = { web: { lists: { getByTitle } } };

  const execute = async (): Promise<void> => {
    site.requestLog.push('batch-execute');
    queue.forEach((op) => op());
    queue.length = 0;
  };

  return [batchedSp, execute];
}

export function createFakeSp(site: IFakeSite): FakeQueryable {
  const log = (op: string): void => {
    site.requestLog.push(op);
  };
  return {
    web: {
      currentUser: async (): Promise<{ Id: number }> => {
        log('read');
        return { Id: site.currentUserId };
      },
      // Minimal `sp.web.ensureUser(login)` — resolves a login to a site user id from
      // site.ensuredUsers (seeded per test), mirroring the shape RoutingServiceCore reads (`.Id`).
      ensureUser: async (login: string): Promise<{ Id: number }> => {
        log('write');
        const id = site.ensuredUsers?.[login];
        if (id === undefined) throw notFoundError();
        return { Id: id };
      },
      // RoleServiceCore's site-owner bootstrap fallback, primary attempt: `.associatedOwnerGroup.users.select('Id')()`.
      associatedOwnerGroup: {
        users: {
          select: (..._f: string[]): FakeQueryable => {
            const inner: FakeQueryable = async (): Promise<Array<{ Id: number }>> => {
              log('read');
              return site.ownerGroupMemberIds.map((id) => ({ Id: id }));
            };
            return inner;
          },
        },
      },
      // `sp.web.select('Title')()` — used by the same fallback to build "{Title} Owners".
      select: (..._f: string[]): FakeQueryable => {
        const inner: FakeQueryable = async (): Promise<{ Title: string }> => {
          log('read');
          return { Title: site.webTitle };
        };
        return inner;
      },
      // Fallback attempt: `.siteGroups.getByName('{Title} Owners').users.select('Id')()`.
      siteGroups: {
        getByName: (groupName: string): FakeQueryable => ({
          users: {
            select: (..._f: string[]): FakeQueryable => {
              const inner: FakeQueryable = async (): Promise<Array<{ Id: number }>> => {
                log('read');
                return (site.namedGroups[groupName] ?? []).map((id) => ({ Id: id }));
              };
              return inner;
            },
          },
        }),
      },
      lists: {
        getByTitle: (title: string): FakeQueryable => ({
          items: makeItemsCollection(site, title, log),
          // Only what ProvisioningCore.getStatus() needs: `.fields.select('Title')()`. Throws
          // not-found for a list that was never seeded at all (via seedList or seedFields),
          // mirroring a real missing list — a list seeded with zero field names returns `[]`.
          fields: {
            select: (..._f: string[]): FakeQueryable => {
              const inner: FakeQueryable = async (): Promise<Array<{ Title: string }>> => {
                log('read');
                const list = site.lists[title];
                if (!list) throw notFoundError();
                return (list.fieldNames ?? []).map((n) => ({ Title: n }));
              };
              return inner;
            },
          },
        }),
      },
    },
    batched: (): [FakeQueryable, () => Promise<void>] => makeBatchedSp(site),
  };
}
