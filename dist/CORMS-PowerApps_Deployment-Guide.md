# CORMS PowerApps — Deployment Guide

How to install the **CORMSApprovals** solution in a Power Platform environment other than the one it was built in, including a different tenant.

Written for a developer who has never seen this solution before. Follow the steps in order — step 4 needs values you can only collect in step 2, and step 7 needs values that only exist after step 5.

Expect **60–90 minutes** for a first-time import.

---

## 1. What you are installing

CORMS is a correspondence and approval system. It has four parts, and **only the first one is in the solution file**:

| Part | Where it lives | In the package? |
|---|---|---|
| 2 canvas apps, 2 code components, 6 flows | Dataverse solution | **Yes** |
| 17 SharePoint lists holding all the data | A SharePoint site | No — you create them (step 2) |
| The SPFx web part that hosts the apps | SharePoint app catalog | No — deployed separately (step 8) |
| SignNow account used for e-signatures | SignNow | No — your own account (step 7) |

### Solution contents

**Canvas apps**

| App | Purpose |
|---|---|
| CORMS Approvals | The approval panel: approve / reject / request change, and the in-app signing session |
| CORMS Task Form | Create a task, task details, and the approval screen |

**Code components (PCF)**

| Component | Used by |
|---|---|
| `corms_CORMS.ApprovalPanel` | CORMS Approvals |
| `corms_CORMS.SigningFrame` | CORMS Task Form |

**Flows**

| Flow | What it does | Trigger |
|---|---|---|
| CORMS - Signing Bridge | Fetches the document, calls the signing flow, saves the signed file back | Called by CORMS Approvals |
| CORMS-eSignature-SignNow | Talks to SignNow: create document, invite, status, download | Called by the Signing Bridge |
| CORMS - Notification Bridge | Connector-free HTTP relay to `Notification_Flow` | Called by CORMS Approvals |
| Notification_Flow | Sends the email / Teams message | Called by the Notification Bridge |
| CORMS - Upload Task Attachment | Uploads a file and sets its list properties | Called by CORMS Task Form |
| CORMS - Check Overdue tasks | Marks overdue tasks | Scheduled |

**Configuration carried by the solution**

- 3 connection references (SharePoint, Office 365 Outlook, Microsoft Teams)
- 12 environment variables (1 SharePoint site + 11 lists)

> The environment variables ship **without values on purpose**. Your environment supplies its own. If an import leaves them empty, the apps read nothing — see *Troubleshooting*.

---

## 2. Before you start

### Tools

```bash
# Power Platform CLI
pac install latest          # or: dotnet tool install --global Microsoft.PowerApps.CLI.Tool
pac auth create --environment <target environment URL>
pac org who                 # ALWAYS confirm you are pointed at the right environment
```

```powershell
# PnP PowerShell, for the SharePoint lists
Install-Module PnP.PowerShell -Scope CurrentUser
```

PnP PowerShell needs its own Entra app registration (v2 and later):

```powershell
Register-PnPEntraIDApp -ApplicationName "CORMS PnP" -Tenant <tenant>.onmicrosoft.com -Interactive
# keep the Client ID it prints - you need it in step 2
```

### Permissions you need

- **System Administrator** or **System Customizer** in the target Dataverse environment
- **Site Collection Administrator** on the target SharePoint site
- Permission to create connections in the target environment

### Licensing — check this first, it blocks everything else

- The apps are **premium**: the code components reach an external service and the flows use the HTTP action. Every user needs a **Power Apps Premium** (per-user) or **per-app** licence.
- The environment must have **Dataverse** — the solution is Dataverse-based.
- **Power Apps component framework for canvas apps must be ON**: Power Platform admin centre → Environments → *your environment* → Settings → Product → Features → **Power Apps component framework for canvas apps** → **On**. If this is off, both apps load with blank panels and no error message.

### Files you need

| File | Purpose |
|---|---|
| `CORMSApprovals_managed.zip` | Import this into another tenant or a production environment |
| `CORMSApprovals_unmanaged.zip` | Only if you intend to keep developing the solution |
| `deployment-settings.json` | The values you fill in at step 4 |
| `Export-CormsSiteTemplate.ps1` | Creates the SharePoint lists |
| `check_export_readiness.py` | Verifies a package before you hand it on |

---

## 3. Step 1 — Create the SharePoint site

Create (or choose) a **team site** in the target tenant, for example `https://contoso.sharepoint.com/sites/CORMS`.

Write the URL down. You need it in step 4 and step 7.

---

## 4. Step 2 — Create the lists

The solution contains **no SharePoint schema**. The lists must exist *before* you import, because the import needs their IDs.

On a machine with access to the **source** site:

```powershell
.\Export-CormsSiteTemplate.ps1 `
    -SourceUrl "https://<source>.sharepoint.com/sites/CORMS" `
    -ClientId  "<your PnP app client id>" `
    -Out       "corms-site-template.xml"
```

Then against the **target** site:

```powershell
Connect-PnPOnline -Url "https://contoso.sharepoint.com/sites/CORMS" -ClientId "<id>" -Interactive
Invoke-PnPSiteTemplate -Path corms-site-template.xml
```

Lists created:

```
CORMS_Correspondence          CORMS_Attachments        CORMS_AuditLog         CORMS_Timeline
CORMS_AdminConfig             CORMS_UserRoles          CORMS_Tasks            CORMS_Delegations
CORMS_ApprovalTasks           CORMS_SigningSessions    CORMS_Templates        CORMS_CustomFolders
CORMS_DelegationAttachments   CORMS_DeliveryTracking   CORMS_NavigationMenu
CORMS_PhysicalAttachments     CORMS_ReadReceipts
```

> **Internal column names must match exactly.** The apps address columns by internal name, so a list rebuilt by hand with the same *display* names will still fail. Always use the template.

### Collect the list IDs

You need the GUID of each list. The fastest way:

```powershell
Connect-PnPOnline -Url "https://contoso.sharepoint.com/sites/CORMS" -ClientId "<id>" -Interactive
Get-PnPList | Where-Object Title -like "CORMS_*" | Select-Object Title, Id | Sort-Object Title
```

In the browser: open the list → **Settings** → **List settings** → the URL ends with `List=%7B<guid>%7D`. That is the ID; `%7B` and `%7D` are `{` and `}`, which you drop.

---

## 5. Step 3 — Create the connections

In the target environment (make.powerapps.com → **Connections** → **New connection**), create one of each, signed in as the account the flows should run as — ideally a service account, not a person:

| Connector | Used by |
|---|---|
| SharePoint | Signing Bridge, eSignature-SignNow, Upload Task Attachment, Check Overdue tasks |
| Office 365 Outlook | Notification_Flow |
| Microsoft Teams | Notification_Flow |

Get each connection's ID from its URL:

```
https://make.powerapps.com/environments/<env>/connections/shared_sharepointonline/<THIS IS THE ID>/details
```

---

## 6. Step 4 — Fill in deployment-settings.json

This file is the whole configuration of the import. Open it and fill every `"Value": ""`.

### Connection references — 3 entries

```jsonc
{
  "LogicalName": "new_sharedsharepointonline_00d04",   // SharePoint
  "ConnectionId": "<id from step 3>",
  "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"
}
```

| LogicalName | Connector |
|---|---|
| `new_sharedsharepointonline_00d04` | SharePoint |
| `corms_sharedoffice365_63afd` | Office 365 Outlook |
| `corms_sharedteams_0a33b` | Microsoft Teams |

### Environment variables — 12 entries

One is the **site URL**. The other eleven are **list GUIDs** from step 2.

| SchemaName | Set it to |
|---|---|
| `new_shared_sharepointonline_bd59cc0b92d9464a9a9513b62f1674c4` | the site URL, e.g. `https://contoso.sharepoint.com/sites/CORMS` |
| `new_shared_sharepointonline_c53c5a63715c45818e8eb4d3b5e548a5` | GUID of `CORMS_AdminConfig` |
| `new_shared_sharepointonline_3c087a2a3c1b45eaa366a0a9ba14b677` | GUID of `CORMS_ApprovalTasks` |
| `new_shared_sharepointonline_a694d47836fa466aa4149c8d68f76349` | GUID of `CORMS_Attachments` |
| `new_shared_sharepointonline_15eb33ef1bd545eab766623250d8288e` | GUID of `CORMS_AuditLog` |
| `new_shared_sharepointonline_d2f9f57a69aa41b2b3c5611f65e36719` | GUID of `CORMS_Correspondence` |
| `new_shared_sharepointonline_7f9d56398e534c3ba07f917e38573b53` | GUID of `CORMS_Delegations` |
| `new_shared_sharepointonline_0ac25ac605c54096b43559e1e44fd655` | GUID of `CORMS_SigningSessions` |
| `new_shared_sharepointonline_fcf52443a8474cd1b2f8ff34a9e5642e` | GUID of `CORMS_Tasks` |
| `new_shared_sharepointonline_f65693355dfe4fe3b41a68917be77e50` | GUID of `CORMS_Templates` |
| `new_shared_sharepointonline_39f9161a015244d68915d0194823f536` | GUID of `CORMS_Timeline` |
| `new_shared_sharepointonline_01455abdf9e74001b385f1be3ccc9eb6` | GUID of `CORMS_UserRoles` |

You do not have to match those long names by hand — every entry in the file carries a readable name:

```jsonc
{
  "SchemaName": "new_shared_sharepointonline_15eb33ef1bd545eab766623250d8288e",
  "Value": "",
  "Name": { "Default": "CORMS_AuditLog" },     // <- match on this
  "TypeId": 100000004,
  "ParameterKey": "table"
}
```

A list GUID is a bare GUID with no braces:

```jsonc
"Value": "48ef8677-f89d-4cd2-901c-fb7ee5cd5590"    // correct
"Value": "{48ef8677-F89D-4CD2-901C-FB7EE5CD5590}"  // wrong - drop the braces
"Value": "CORMS_Attachments"                       // wrong - it must be the ID, not the name
```

> **Do not skip any.** An empty value does not fail the import — the app simply reads nothing at run time, which is far harder to diagnose later.

---

## 7. Step 5 — Import the solution

```bash
pac org who   # confirm the target environment one more time

pac solution import \
  --path CORMSApprovals_managed.zip \
  --settings-file deployment-settings.json \
  --publish-changes \
  --async
```

Through the UI instead: make.powerapps.com → **Solutions** → **Import solution** → browse to the zip. The wizard asks for the same connections and variable values, one screen each.

Import takes 5–15 minutes. If it fails, read **Troubleshooting** before retrying.

---

## 8. Step 6 — Turn the flows on

**Flows always arrive deactivated.** Nothing works until you switch them on.

Solutions → CORMSApprovals → **Cloud flows** → for each of the six: **Turn on**.

Then open each flow and check for warning triangles on actions — that means a connection is unbound. Click it and pick the connection.

---

## 9. Step 7 — Fill CORMS_AdminConfig

Open the `CORMS_AdminConfig` list and create one item per row below. The two relevant columns are **Title** (the key) and **Value**.

| Title | Value |
|---|---|
| `site.baseUrl` | `https://contoso.sharepoint.com/sites/CORMS` |
| `signature.provider` | `SignNow` |
| `signature.providerBaseUrl` | SignNow API base URL, e.g. `https://api.signnow.com` |
| `signature.providerUsername` | SignNow account user |
| `signature.providerPassword` | SignNow account password |
| `signature.providerClientCredentials` | SignNow basic auth token (base64 of `client_id:client_secret`) |
| `signature.flowUrl` | HTTP POST URL of **CORMS - Signing Bridge** |
| `notification.flowUrl` | HTTP POST URL of **Notification_Flow** |
| `notification.teamsTeamId` | Teams team ID for notifications, or leave blank |

### Where the two flow URLs come from

They only exist after step 5, and they are **different in every environment**. Open the flow → the trigger (**When a Power Apps (V2) calls a flow**, or **When an HTTP request is received**) → copy the **HTTP POST URL**.

> These URLs contain an access signature. Treat them as credentials: do not paste them into chat and do not commit them to source control.

### Also populate

- **`CORMS_UserRoles`** — at least one user with role `SystemAdministrator`, or nobody can administer the system.
- **`CORMS_NavigationMenu`** and **`CORMS_Templates`** — copy from the source site if the business expects the same menu and templates.

---

## 10. Step 8 — Deploy the SPFx web part

The canvas apps are embedded in a SharePoint page by an SPFx web part. **The apps get new App IDs in your environment**, so the web part must be repointed.

1. Upload the `.sppkg` to the tenant App Catalog and deploy it.
2. Add the web part to the CORMS page.
3. Get the new App IDs — Solutions → CORMSApprovals → the app → **Details** → **App ID**, or:

```bash
pac canvas list
```

4. Put the new IDs in the web part's properties.

The host passes parameters to the apps. Keep these if you are rebuilding the page:

| App | Parameters |
|---|---|
| CORMS Approvals | `approvalTaskId` or `taskId`, `correspondenceId` |
| CORMS Task Form | `taskId`, `screen=create\|detail\|approval`, `subject=NeedApproval` |

---

## 11. Step 9 — Smoke test

Work through these in order. Each checks a different layer, so if an early one fails the later ones cannot pass.

1. **Open CORMS Task Form.** Lists load → the environment variables resolved.
2. **Create a task.** A row appears in `CORMS_Tasks` → writes work.
3. **Attach a file.** A row appears in `CORMS_Attachments` → *CORMS - Upload Task Attachment* works.
4. **Send it for approval and open CORMS Approvals.** The panel shows the approval chain → the code component loaded and the data is readable.
5. **Approve with a comment.** The task updates and rows appear in `CORMS_AuditLog` and `CORMS_Timeline` → the decision path works.
6. **A step that requires a signature.** Click *Sign document*. The SignNow session appears in the dialog and the task completes by itself after signing → Signing Bridge, the SignNow flow and the provider settings are all correct.
7. **Check the recipient got the email / Teams message** → Notification Bridge and Notification_Flow.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Apps open, every list is empty, no error | Environment variable values empty or wrong | Solutions → CORMSApprovals → Environment variables: all 12 need a **Current Value**. Values are cached and can take up to an hour to propagate; a fresh browser session clears local caching. |
| `This site has exceeded its maximum file storage limit` on any save | SharePoint site over quota | Empty both recycle bin stages, cap version history on `CORMS_Attachments` (the signing flow writes a version per signature), raise the quota. **Every write fails until this is cleared.** |
| Flow fails with `InvokerConnectionOverrideFailed` | A connection reference is unbound, or the flow was edited in the portal and silently re-pointed at a new reference | Open the flow and rebind the connection. If an app calls that flow, remove and re-add the flow in the app, then republish the app. |
| Nothing happens at all; no flow runs | Flows still deactivated | Step 6. This is the most common miss. |
| The approval panel area is blank | Code components disabled in the environment | Admin centre → Environment → Settings → Features → **Power Apps component framework for canvas apps** → On. |
| Signing dialog spins forever on "Confirming your signature" | The signing request was never written to the task — usually a failed SharePoint write (quota) or a wrong `signature.flowUrl` | Check the site quota first, then the run history of *CORMS - Signing Bridge*. |
| Links open the wrong tenant's site | `site.baseUrl` missing from `CORMS_AdminConfig` | Add it. The apps fall back to a built-in default when the row is absent. |
| Import fails: connection reference not found | The settings file was not applied, or an entry was renamed | Re-run the import **with** `--settings-file`. |
| A code component looks like an older version after an update | Someone published the app from a Studio tab that was opened before the import | Re-import the solution with `--publish-changes`, and do **not** publish the app from Studio afterwards. |
| `pac` commands hit the wrong environment | More than one auth profile | `pac auth list`, `pac auth select --index <n>`, then `pac org who`. |

---

## 13. Updating the solution later

1. In the **source** environment, raise the version (Solutions → CORMSApprovals → Edit → Version). A managed **upgrade** requires a version higher than the one installed in the target.
2. Export:

```bash
pac solution export --name CORMSApprovals --path . --managed --overwrite
```

3. **Verify before you send it on:**

```bash
python check_export_readiness.py CORMSApprovals_managed.zip
```

It must print `0 issue(s) blocking a clean import elsewhere.` The checker catches the three ways this package silently breaks: a connection reference the flows use but the package omits, a data source or flow action that slipped back to a hard-coded site or list, and an environment variable the apps use that is not in the solution.

4. Import into the target with the **same** settings file. Existing values are kept.

> Editing a flow or an app in the maker portal is what breaks portability — it is how hard-coded lists and stray connection references come back. Always run the checker after portal edits.

---

## 14. The code component source

The solution ships the components **compiled** - `bundle.js`, the CSS and the manifest. The
TypeScript is not in the package, so you cannot read or change a component from the zip alone.

The source is delivered separately as **`CORMS-PCF-Source.zip`**, containing both projects
(`pcf-approval/` = ApprovalPanel, `pcf/` = SigningFrame) and a README covering how to build them,
how to push a build to your environment, and the one non-obvious part: a canvas app embeds its own
copy of a component, so pushing a new build does **not** update an app that already uses it.

If you received the solution as **managed**, its components cannot be modified in your environment.
Changing one means building from this source under your own publisher, or asking the maintainer for
a new version of the managed solution.

---

## 15. Quick reference

**Order of operations:** site → lists → list IDs → connections → settings file → import → turn flows on → AdminConfig → SPFx → test.

**Different in every environment — never copy between them:**

- the SharePoint site URL and all list GUIDs (the environment variables)
- the two flow HTTP URLs in `CORMS_AdminConfig`
- the canvas App IDs used by the SPFx web part
- connection IDs

**The same everywhere:** environment variable *schema names*, connection reference *logical names*, list *names* and their internal column names.
