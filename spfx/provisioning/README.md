# CORMS SharePoint list provisioning (superseded for Sprint 1 lists)

> **Superseded, not deleted.** As of the Sprint 1 list-provisioning task, every CORMS-owned list
> needed by Sprint 1 (`CORMS_AdminConfig`, `CORMS_Timeline`,
> `CORMS_Correspondence`, `CORMS_Attachments`, `CORMS_PhysicalAttachments`, `CORMS_Delegations`,
> `CORMS_DeliveryTracking`, `CORMS_CustomFolders`, `CORMS_Tasks`) is provisioned **in-app** instead
> — schema-as-data in `src/provisioning/listSchemas.ts`, run from the SPFx app's own
> Administration → **Provision Lists** screen (Administrator-only), using PnPjs (`@pnp/sp`) instead
> of pasted browser-console scripts. See the root [`README.md`](../README.md)'s "Sprint 1 — In-app
> SharePoint list provisioning" section for the schema list, provisioning flow, and the
> `CORMS_DevSettings` → `CORMS_AdminConfig` migration note. This folder's scripts and the
> `CORMS_DevSettings` list they created are left as-is (not deleted, not auto-migrated) — see that
> migration note before assuming either is unused on a given site. Nothing below this notice has
> been changed; it documents the original (pre-Sprint-1) approach for lists not yet moved in-app.
> Audit is now written/read through Elasticsearch (`integration.elasticAuditIndex`, default
> `sslaudit`); any existing `CORMS_AuditLog` list is retained as unmigrated legacy history only.

Browser-console scripts that provision **CORMS-owned** SharePoint lists via the SharePoint REST
API. This folder is **outside `src/`** and is not part of the SPFx bundle (confirmed: `tsconfig.json`'s
`include` and the `lint` script both scope to `src/**/*.ts(x)` only, and webpack only bundles
modules reachable from the SPFx entry point — nothing here is reachable from it).

RecordsHub-owned lists are **never** provisioned here — CORMS only reads those; this folder only
ever creates lists CORMS itself owns (e.g. `CORMS_DevSettings`).

## Why console scripts, not PnP/site-template provisioning

Quick for DEV, and because the scripts live in the repo and are idempotent, they're repeatable
across DEV/UAT/PROD by pasting into each site's console. Trade-off: execution is manual (no CI
automation) and the operator needs list-creation rights on each target site. Acceptable for the
current DEV/testing phase; revisit a repeatable pipeline (PnP provisioning, a deployment script)
at main-tenant cutover if needed.

## Running a script

1. Sign in to the **target site** in the browser (must have list-creation rights).
2. Open any page on that site → **F12 → Console**.
3. Paste the contents of **`sp-provision.js`** (defines `window.CORMSProvision`), press Enter.
4. Paste the contents of the specific list script (e.g. **`lists/CORMS_DevSettings.js`**), press
   Enter.
5. Read the console tally (`created N, existed M, errors K`). Re-run any time — every step is
   idempotent (existence-checked before creating/adding anything), so re-running makes no
   destructive change.

For a different environment (UAT/PROD later), repeat on that site's console. If the target site
isn't the current page's site, call `CORMSProvision.setSite('https://.../sites/...')` right after
pasting the helper, before pasting the list script.

## Required permissions

The signed-in user needs list-creation rights on the target site (e.g. Site Owner / Full Control).
Provisioning does not touch site collection features, permissions, or anything outside the lists
it creates.

## Idempotency

Every helper call (`ensureList`, `ensureTextField`, `ensureNumberField`, `ensureDateField`,
`ensureChoiceField`, `ensureFieldXml`) checks for existence first (`GET .../getbytitle(...)` →
404 means absent) and only issues a `POST` when something is missing. Nothing is ever deleted or
overwritten by these scripts.

## Adding a new list

Copy `lists/_TEMPLATE.list.js` to `lists/CORMS_<Feature>.js`, fill in the title/description and
field definitions using the `CORMSProvision.ensure*` calls, and document the agreed schema in the
owning feature task before running it (schema-before-provisioning).

## odata verbosity

Scripts use `odata=verbose` throughout for reliability in the console (structured `d.` envelope,
easier to inspect ad hoc). `nometadata` is a lighter-weight option — TODO(confirm) if switching is
wanted later; the app's own live services (`src/services/**/*.live.ts`) use `nometadata` since they
don't need the console-inspection convenience.

## Lists provisioned so far

| Script | List | Backs |
|---|---|---|
| `lists/CORMS_DevSettings.js` | `CORMS_DevSettings` | TASK-03 (Admin Config data-source toggle) |

Feature lists arrive incrementally, one per owning feature task, once each schema is agreed —
TODO(confirm) this stays the approach going forward.
