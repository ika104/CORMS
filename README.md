# CORMS

Source for the CORMS correspondence and approval system: an SPFx single-page app hosting two Power
Apps canvas apps, two PCF code components and a set of Power Automate flows, over SharePoint lists.

## Layout

| Folder | What it is |
|---|---|
| `spfx/` | The SPFx single-page app that hosts everything. Its own `README.md` is the engineering log: toolchain, build and deploy steps, decisions, and per-epic implementation notes. |
| `pcf-approval/` | PCF code component `corms_CORMS.ApprovalPanel` — the approval panel used by the CORMS Approvals canvas app, including the in-app signing session. |
| `pcf/` | PCF code component `corms_CORMS.SigningFrame` — used by the CORMS Task Form canvas app. |
| `approvals-app/` | Canvas source (`.pa.yaml`) for **CORMS Approvals**. |
| `taskform-app/` | Canvas source (`.pa.yaml`) for **CORMS Task Form**. |
| `flows/` | Power Automate flow definitions. |
| `connector/` | Custom connector definition for the audit API. |
| `tools/` | `check_export_readiness.py` — verifies a solution export can be imported elsewhere. `Export-CormsSiteTemplate.ps1` — provisions the SharePoint lists in a new tenant. |
| `dist/` | The deployment guide, the settings template an importing environment fills in, and the tools copied beside them. The built packages themselves are not in git. |
| `docs/` | Implementation notes. |

## Deploying this somewhere

Read **[dist/CORMS-PowerApps_Deployment-Guide.md](dist/CORMS-PowerApps_Deployment-Guide.md)**.
It covers the whole path: create the SharePoint site and lists, create connections, fill in the
settings file, import the solution, turn the flows on, fill `CORMS_AdminConfig`, deploy the web part,
and a smoke test — plus troubleshooting for the failures this system actually produces.

Two things are not in this repository and must come from whoever maintains the system:

- the **Dataverse solution package** (`CORMSApprovals_managed.zip`) — the canvas apps, components and
  flows as an importable unit. The sources here are what it is built from, not a substitute for it.
- the built **`.sppkg`** for the SPFx web part, or build it yourself from `spfx/`.

## Building the code components

```bash
cd pcf-approval        # or: cd pcf
npm install
npm run build
pac pcf push --publisher-prefix corms
```

A canvas app embeds **its own copy** of a code component, so pushing a new build does not update an
app that already uses it. Section 14 of the deployment guide explains the route that does work.

## Configuration

No credentials are in this repository and none should ever be added. Everything environment-specific
lives outside the source:

| Setting | Where it lives |
|---|---|
| SharePoint site and list IDs | Dataverse environment variables, supplied at solution import |
| SignNow credentials, flow callback URLs, Teams team id | the `CORMS_AdminConfig` SharePoint list |
| Connections (SharePoint, Outlook, Teams) | connection references, bound at solution import |

The flow definitions read credentials from `CORMS_AdminConfig` at run time, which is why they are
safe to keep in source control. Keep any change that way.

## What is deliberately not here

Build output (`node_modules/`, `out/`, `obj/`), Power Platform artefacts (`.msapp`, solution `.zip`,
`.sppkg`) and business documents such as the requirements workbook. See `.gitignore`.
