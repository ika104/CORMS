# CORMS Power Apps: code analysis

Written 2026-11-05, before starting work on this repository. Updated the same day after comparing
the repository with the live solution export, **CORMSApprovals 1.0.0.5 (unmanaged)**. The repository now
holds that export's apps and flows.

> **Since then:** the UAT release work (2026-11-07) fixed most findings below. What changed, and what
> is still open, is in [UAT-RELEASE-PLAN.md](UAT-RELEASE-PLAN.md). The repository now holds the
> **CORMSApprovals 1.0.0.9** export: SigningFrame is out of the solution, HostSignal and the
> Audit Search flow are in, and `CORMS_AuditLog` is no longer used anywhere.

Line numbers in the canvas apps refer to the files as first committed (`8e1220e`). The live copies
carry an 8-line header that Studio adds, so they sit 8 lines lower. Flow line numbers refer to the
synced files.

---

## 1. What is in the repository

| Folder | What it is | Size | Status |
|---|---|---|---|
| `approvals-app/` | **CORMS Approvals** canvas app: 1 screen | 1,236 lines | In use. Opened by SPFx from Approval Tasks and My Tasks |
| `taskform-app/` | **CORMS Task Form** canvas app: Create, Detail and Approval screens | 4,700 lines | Create and Detail are in use. The Approval screen is not reachable from SPFx |
| `pcf-approval/` | `corms_CORMS.ApprovalPanel` v0.0.20: the whole approval UI, in vanilla TypeScript | 571 lines | In use (Approvals app) |
| `pcf/` | `corms_CORMS.SigningFrame` v0.0.1 | 146 lines | **Not used.** No app places it |
| `flows/` | The 6 flows in the solution, synced from the live export, plus 1 legacy flow | | See §6 |
| `connector/` | "CORMS Audit API" custom connector (`sslomanonline.com:9220`) | | **Not used** by either app |
| `tools/`, `dist/` | Export checker, list-template script, deployment guide, settings file | | `dist/` holds copies of `tools/` (identical) |
| `docs/close-panel-signal.md` | How the apps tell the SPFx page to close the panel | | App side done, **SPFx side never built** (§5) |

Still not in this repository:

| Missing | Where it actually is |
|---|---|
| The solution zip, App IDs, connection IDs | The live **SSL (default)** environment. Zips are git-ignored |
| Specs for pending Power Apps work | `corms/docs/POWERAPPS-APPROVAL-TASK-STAGE2-CHANGES.md`, `corms/docs/POWERAPPS-REVIEW-FEEDBACK-3-CHANGES.md` |

`corms/docs/signing-flow.signnow.json` and `corms/docs/notification-flow.json` in the SPFx repo are
older copies of `flows/CORMS-eSignature-SignNow.json` and `flows/Notification_Flow.json`. Their
actions are the same; only the site, list and connection bindings differ.

### What the live export showed

The live 1.0.0.5 export passes `tools/check_export_readiness.py` with **0 issues**: every flow reads
its site and lists from environment variables, and every connection reference is packaged.

| Part | Live compared with the first commit (`8e1220e`) |
|---|---|
| Both canvas apps | **Same logic.** The only differences are Studio's header and control version tags (`ModernButton@1.0.0`) |
| Both PCF components | Same versions (0.0.20, 0.0.1) |
| Notification Bridge | Identical |
| Signing Bridge | Same logic. The repository copy was older: it hard-coded the site and bound to `corms_sharedsharepointonline_d1ca8`. Live it reads the site variable and uses `new_sharedsharepointonline_00d04` |
| eSignature-SignNow, Notification_Flow | Same actions as the `corms/docs/` copies |
| Upload Task Attachment, Check Overdue tasks | Not in any repository before. Both have bugs (findings 21 and 22) |
| `CORMS-Approval-Notification` | **Not in the solution.** Kept in `flows/` only as a record |

All six flows, the three connection references and the twelve environment variables are owned by
one other maker. Exporting needs read access to each of those records (§9).

---

## 2. How the parts fit together

```
SPFx web part (corms repo)
  │  reads app URLs from CORMS_AdminConfig:
  │    powerAppsTaskFormUrl · powerAppsTaskDetailUrl ({taskId}) · powerAppsApprovalTasksUrl
  │    ({approvalTaskId}, {correspondenceId})
  ▼
<iframe> EmbeddedFrameModal  ──────────────  apps.powerapps.com
                                              │
            ┌─────────────────────────────────┴──────────────────────┐
            ▼                                                        ▼
   CORMS Approvals                                           CORMS Task Form
   ApprovalScreen                                   Create · Detail · (Approval)
     │ DataJson / CanAct / SigningUrl ...                    │
     ▼                                                       │ Patch
   ApprovalPanel (PCF) ── Action (JSON) ──► 300 ms timer     │
     │                                       │               ▼
     │ iframe ──► SignNow                    ├── Patch ──► SharePoint lists (CORMS_*)
                                             ├── CORMS-SigningBridge ──HTTP──► eSignature-SignNow ──► SignNow API
                                             └── CORMS-NotificationBridge ──HTTP──► Notification_Flow ──► Outlook / Teams
```

- **Every data rule is a Power Fx formula** run in the user's browser. Writes go straight to the
  SharePoint lists as the signed-in user. Nothing on the server enforces the rules, so SharePoint
  list permissions are the only hard protection. The same is true of SPFx.
- **The "bridge" flows exist to avoid a premium connector in the app.** The app calls a
  Power Apps-triggered flow, giving it the target flow's HTTP URL (read from `CORMS_AdminConfig`)
  and a payload. The bridge then POSTs it with the HTTP action.
- **Signing**: the app asks the bridge for a signing URL, the PCF shows it in an iframe, and the
  app polls the provider for completion. When signing completes, it downloads the signed file over
  the main document, then records the approval.

### Parameters the apps read

| App | Parameter | Effect |
|---|---|---|
| Approvals | `approvalTaskId` or `taskId` | Task to open |
| Approvals | `correspondenceId` | Opens the user's own pending task on that correspondence |
| Approvals | *(none)* | Falls back to the user's oldest pending task, then to **any** pending task |
| Task Form | `screen=create\|detail\|approval` | Start screen. Without it: no `taskId` opens create, `taskId` opens detail |
| Task Form | `subject=NeedApproval` | Approval screen |
| Task Form | `taskId` | CORMS_Tasks item for Detail and Approval |
| Task Form | `relatedCorrespondenceId` | Pre-selects the correspondence on Create (ID or reference number) |
| Task Form | `securityTier`, `originatorEmail`, `documentUrl` | Shown and used as-is on the Approval screen |

SPFx sends `requestedBy` to the Task Form (ignored) and never sends `relatedCorrespondenceId` or
`screen`.

---

## 3. CORMS Approvals (`approvals-app/`)

A single screen. It has no visible controls of its own: the ApprovalPanel PCF fills the screen,
and two invisible controls drive it.

1. **`btnLoad`** (selected from `OnVisible`): resolves the task and loads every step of the
   correspondence into `colAllSteps`, then keeps only the latest round in `colSteps`. From those
   it builds the chain: step status, then a Reject that cancels the steps after it, then the
   active step and the phase (Review, Signing or Legacy). It maps the outcome to the
   correspondence status. It also works out whose turn it is (Department/All is a seniority
   ladder) and checks delegations, which gives `varCanAct`. All of this is serialised into
   `varPanelData` for the component.
2. **`tmrPanel`** (300 ms, repeats forever) reads `ApprovalPanel7.Action` and parses the JSON.
   When the `at` timestamp changes, it dispatches one of:
   - `Approve` / `Reject` / `Return` set `varDecideNow`.
   - `RequestSignature` calls the Signing Bridge, then writes ApprovalTasks, AuditLog, Timeline
     and SigningSessions, and sets `varSigningUrl`.
   - `SigningEnded` asks for a status poll now.
   - `OpenCorrespondence` opens a new tab.
   - `Close` runs `Launch(fxCloseUrl#corms=close)`.
   - While a signing session is open, every 50 ticks (about 15 s, at most 40 times) it calls
     `GetSigningStatus`. On completion it calls `GetSignedDocument`, stamps
     `SignatureCompletedAt`, and auto-approves.
   - **Decision** (`varDecideNow`): validate, Patch the task, cancel every other pending task on
     Reject or Return, rebuild the chain, Patch `CORMS_Correspondence.Status`, write Audit and
     Timeline, and notify the author and the next step's assignees.

The chain-building block, about 180 lines, is **copied in full four times** (load, after signing,
after a decision, and the `varPanelData` JSON a fourth time). Any rule change must be made in
every copy. It is the first candidate for named formulas or user-defined functions.

Correspondence status mapping (matches SPFx `approvalProgress.ts`):

| Phase | All approved | Rejected | Returned | Otherwise |
|---|---|---|---|---|
| Review | Awaiting Final Confirmation | Returned to Author | Returned to Author | In Review |
| Signing | Signed | Rejected | Change Requested | Awaiting Signature |
| Legacy | Approved | Rejected | Draft | In Review |

---

## 4. CORMS Task Form (`taskform-app/`)

- **TaskCreateScreen** ("Create Action Item"):
  - Type (Follow-up Task / To Do / Reminder) and Priority are button groups backed by the
    `VarShowForm` / `VarShowRev` / `VarShowFilles` variables, names copied from another app.
  - The assignee comes from `Office365Users.SearchUserV2` (guests excluded), or "Assign to
    myself".
  - The related correspondence is picked from all of `CORMS_Correspondence`.
  - Files are picked with an Attachments control inside a form that is never submitted. Each file
    goes through the `CORMS-UploadTaskAttachment` flow.
  - The reference number is `TSK-<year>-<ID:0000>`, written in a second Patch.
  - It writes Audit and Timeline rows, then closes through `#corms=created;ref=…`.
- **TaskDetailScreen**, 3,229 lines, tabs: Details · Files · Notes · Security · Audit · Timeline.
  - "Document & Approval" is commented out of the tab list, so its Approve button is
    unreachable.
  - Details is a field table with inline editing. Admins (`SystemAdministrator` in
    `CORMS_UserRoles`) can edit every field. Everyone else can edit only Status.
  - Files merges the task's own attachments with the related correspondence's.
  - Notes are Timeline rows with `Title = "Note"`.
  - Security is a **hard-coded** list of three SharePoint groups.
  - Every column has a filter row and sort headers.
  - The load block (rows, audit, events) is repeated in OnVisible, Save, Approve and Add Note.
- **ApprovalScreen**: an older, absolutely-positioned layout. Approve, Reject and Request Changes
  set the CORMS_Tasks status. It has no permission check, and it shows `securityTier` and
  `originatorEmail` straight from the URL.

Task Timeline rows are stored with the task's `TSK-…` reference in the `CorrespondenceId` column.

---

## 5. Integration with SPFx

| Concern | Power Apps side | SPFx side | Gap |
|---|---|---|---|
| Closing the panel | `Launch(<site>/_api/web/title#corms=cancel\|created;ref=…\|close\|open:<id>, Replace)` | `PowerAppsFormModal` waits for `postMessage({type:'corms:form-submitted'})`, which canvas apps cannot send | **Nothing reads `#corms=`.** After Cancel, Create or Close, the modal stays open showing one line of XML. My Tasks only refreshes when the user presses ✕ |
| Pre-selecting a correspondence | Reads `relatedCorrespondenceId` | Never sends it | The feature cannot trigger from CORMS |
| App URLs | n/a | Three `CORMS_AdminConfig` rows | The deployment guide (step 8) wrongly says "web part properties" |
| Approval rules | Power Fx, copied 4 times | `services/approvalTasks/*`, unit-tested | Two implementations. SPFx's is more complete (§7) |
| Signing | Its own flow, polling and detection | `SigningFrameModal`, `signingReturn.ts` | Two implementations, both writing `CORMS_ApprovalTasks` |

---

## 6. Flows, connector and tools

- **CORMS-Signing-Bridge**: Power Apps V2 trigger, 12 text inputs (`text`…`text_11`), three
  operations.
  - Create: reads the main document with `GetFileContentByPath`, base64-encodes it and POSTs to
    `signature.flowUrl`.
  - Status: passes through.
  - Signed document: on download it **overwrites the main document** with `CreateFile`
    (one new version per signature).
  - The connection runs as the invoker.
- **CORMS-NotificationBridge**: relays `BodyJson` to `notification.flowUrl` and returns
  `sent`/`status`/`error`. `sent` is true only on HTTP 200. An HTTP-triggered flow without a
  Response action returns 202, so `sent` may always read false.
- **CORMS-eSignature-SignNow**: HTTP trigger, 57 actions. It reads the provider settings from
  `CORMS_AdminConfig` at run time, then creates the document, invites the signer, checks status
  and downloads the signed file through the SignNow API. Two stopped copies sit outside the
  solution (`…-25092026`, `…-25102026`).
- **Notification_Flow**: HTTP trigger (`triggerAuthenticationType: All`, so the signed URL is the
  only protection). It loops over `recipients` (`Notify_each_person`) and sends an Outlook email
  and a Teams message to each person.
- **CORMS - Upload Task Attachment**: Power Apps V2 trigger (`file`, `text` = TaskReferenceNo,
  `text_1` = CorrespondenceId).
  - It creates `/CORMS_Attachments/<TaskRef>_<file name>` and then sets the file's properties.
  - It never writes either reference to the file's columns (finding 21).
  - The properties step writes fixed defaults to about 30 RecordsHub/SSL governance columns.
- **CORMS - Check Overdue tasks**: runs daily (Arab Standard Time). It reads `CORMS_Tasks` where
  Status is Pending or In Progress and `DueDate` is before today, then updates each item. That
  update only writes the item's own Title back and resets RecordsHub fields (finding 22).
- **CORMS-Approval-Notification** (repository only, not in the solution): emails the originator
  from the **user's own mailbox** (invoker Outlook connection). No app calls it. Legacy.
- **Custom connector**: `POST /api/Audit/log` and `POST /api/Search/elasticsearch` on
  `sslomanonline.com:9220`. It declares **no authentication** and is unused by the apps.
- **check_export_readiness.py**: inspects a solution zip for missing or unused connection
  references, pinned site/list values in flows and apps, and environment variables that are
  missing or carry values. Useful; run it after every portal edit.
- **Export-CormsSiteTemplate.ps1**: PnP template of the 17 lists, plus a CSV of AdminConfig keys
  to fill. It omits `site.baseUrl`, which the guide requires.

---

## 7. Findings

Severity is for this system's users: **High** means a wrong result, data loss or a security
exposure in normal use.

### High

1. **Anyone can decide a group or department task in the Approvals app.**
   - SPFx creates group/team tasks with a blank `AssignedToId` (plus `AssignedGroupId` or
     `AssignedToTeam`).
   - The app treats a blank `AssignedToId` as "anyone may act"
     (`ApprovalScreen.pa.yaml:87`, `:275`).
   - `AssignedGroupId`, team membership and department are never checked. SPFx checks all three
     (`approvalActor.ts: isAssignedTo`).
2. **The assignee match is a substring match.** `Lower(User().Email) in Lower(AssignedToId)`
   (`:43`, `:88`, `:255`, `:276`) lets `ali@x.com` act on a task for `bali@x.com`. SPFx compares
   exactly (`key === email || key.endsWith('|'+email)`).
3. **A failed download of the signed document still approves the step.**
   - At `ApprovalScreen.pa.yaml:530-541` the error is shown, but `SignatureCompletedAt` is
     stamped anyway and the auto-approve continues.
   - In the Signing Bridge, a failure of `Replace_main_document` still answers 200 with no
     `error`.
   - Result: a step can be "Signed" while the library still holds the unsigned file.
4. **SignNow credentials are readable by every app user.**
   - The apps read `CORMS_AdminConfig` (`:102-111`), so every user needs read access to the list.
   - The same list holds `signature.providerPassword`, `signature.providerClientCredentials` and
     both flow SAS URLs.
   - Anyone can read them through SharePoint REST unless those rows have item-level permissions.
     SPFx has the same dependency.
5. **The panel never closes from inside the apps** (§5). The app side is done
   (`docs/close-panel-signal.md`); the SPFx listener was never written.

Found after the live export. They are numbered after the rest, so the references elsewhere still
hold:

21. **Files uploaded with a new task are never linked to it.**
    - `CORMS - Upload Task Attachment` receives the task reference and the correspondence ID.
    - It uses the reference only in the file name (`CORMS-Upload-Task-Attachment.json:119`).
    - `Update_file_properties` (`:130`) sets neither `TaskReferenceNo` nor `CorrespondenceId`.
    - The Task Detail **Files** tab finds task files by `TaskReferenceNo`, so these files never
      appear there, and nothing links them to the correspondence.
    - The deployment guide's smoke test ("a row appears in CORMS_Attachments") still passes, so
      the bug goes unnoticed.
    - **Fixed 2026-11-05.** `Update file properties` was replaced with a SharePoint REST `MERGE`
      that writes only `TaskReferenceNo`, `IsMainLetter` and `IsQualityOverridden`.
      - It no longer writes any RecordsHub (`RH_*`) or `SSL_*` column, so the flow also turns on
        in a tenant without RecordsHub. That was the client's import failure.
      - Tested: TSK-2026-0047's file has `TaskReferenceNo` set.
      - The Task Form's link to the flow lacked the solution's flow ID, so it called a deleted
        flow. It was re-added in Studio by the connection owner and republished.
      - `CorrespondenceId` is deliberately left blank. The September version of the flow did set
        it, but CORMS and the Approvals app treat any file carrying a correspondence's ID as one
        of its documents, and can pick it as the main letter. Linking task files to the
        correspondence needs a product decision first.
    - Also fixed in the live environment: **Check Overdue tasks** was turned off on 2026-11-05,
      then removed from the solution (the flow itself remains, off). Nothing reads the stored
      "Overdue" status: CORMS works it out from `DueDate` (`mapTaskRow.ts`), and so does the
      Task Form.
      Its only recent effect was on TSK-2026-0031: RecordsHub flags went from empty to `false`;
      no record or hold was lost.
22. **The overdue flow marks nothing as overdue and resets RecordsHub flags every night.**
    - Each overdue task gets `Title` = its own Title, plus `RH_Record`, `RH_Hold`, `RH_Vital` and
      their `Forced…` and `IsInheritedFromParent` columns set to `false`.
    - It also sets `RH_NoCapture` to `false`, `RH_SyncStatus` to `Pending`, and blanks `Record` and
      `Record Status` (`CORMS-Check-Overdue-Tasks.json:90-110`).
    - So any RecordsHub declaration or hold on an overdue task is undone daily.
    - The apps already work out "overdue" from `DueDate`, so turning the flow off loses nothing.
      If an overdue state is wanted, write `Status` and only `Status`.

### Medium

6. **The ApprovalPanel rebuilds its whole DOM on every `updateView`** (`index.ts:231`),
   including the signing iframe.
   - Any input change during signing reloads the SignNow page: Busy toggling, an error message,
     or a new `DataJson` after a poll.
   - Each reload also counts toward the "second load means done" heuristic (`:507-512`), so
     "Confirming…" can appear before the user has signed.
7. **The "Confirming your signature" state can stick forever.** In that state the dialog shows
   only a spinner, and Cancel appears only if there is an error (`index.ts:416-425`). Automatic
   polling stops after 40 tries (about 10 min) and never raises one.
8. **No concurrency check before deciding.**
   - The spec (Rule 4.1) says to re-read the task first.
   - The app decides on `varTask` from the collection loaded on open.
   - Two approvers in an "Any" step can both write. SPFx raises `ApprovalConflictError`.
9. **Delegation does not match the spec.** `CORMS_Delegations` is filtered only by dates
   (`:243-248`), not `Status = Active`. `DecidedBy` is written as the plain name (`:792`) instead
   of `"{user} on behalf of {delegator}"`.
10. **The Signing Bridge builds JSON by hand.**
    - The signer JSON is built by string concatenation (`CORMS-Signing-Bridge.json:183`), so a
      name containing `"` or `\` breaks the request.
    - `PlacementJson` is spliced in raw.
    - (The hard-coded site this finding first reported exists only in the repository's old copy.
      The live flow reads the site variable.)
11. **Task Form permissions.**
    - Any user can change any task's Status on Detail; edit visibility is the only check
      (`TaskDetailScreen.pa.yaml:1233`).
    - The Approval screen has no check at all.
    - Assignment, creation and status changes send no notification.
12. **Delegation limits** (the SharePoint connector evaluates only the first 500 to 2,000 rows):
    - `Distinct(CORMS_Tasks, AssignedToTeam)` (`TaskCreateScreen.pa.yaml:423`,
      `TaskDetailScreen.pa.yaml:1142`).
    - The `in` filters in the Approvals fallback (`ApprovalScreen.pa.yaml:40-46`).
    - These go quietly wrong as the lists grow.
13. **The correspondence pickers list every correspondence.** In Create and Detail,
    `Sort(CORMS_Correspondence, ID, Descending)` exposes the subjects of items above the user's
    clearance, when list permissions allow it. The app has no security-level check.

### Low

14. **Timeline rows are stamped `EventTimestamp: Today()`**, a date with no time, 13 times in the
    Task Form. Same-day events have no order in other views.
15. **The download URL is not URL-encoded** (`TaskDetailScreen.pa.yaml:55`, `:75`). File names
    with `&`, `#` or `%` break.
16. **The Approvals fallback opens *any* pending task** when no parameter is given. That is
    useful in Studio, but in production it shows another person's correspondence header and
    chain.
17. **Wrong or misleading wording.**
    - "roughly every 4s" means 15 s (`:467`).
    - The PCF label says "A comment is required to return a task", but every decision requires
      one.
    - A Return writes Timeline `EventType = "Edited"`.
18. **Hard-coded fallbacks.** `ssloman.sharepoint.com` appears in four formula fallbacks. The
    Security tab's group list is static.
19. **Dead code.**
    - The SigningFrame PCF.
    - `startPolling`/`parseReturn` in ApprovalPanel: the return page is on another domain, so
      the component can never read it.
    - The Task Form Approval screen and the Document & Approval tab.
    - The hidden team combobox: it is always blank, so `AssignedToTeam` is only ever set by
      "Assign to myself".
    - The `CORMS-Approval-Notification` flow.
    - The unused custom connector.
20. **Other notes.**
    - `pcf-approval/mock/sample-data.json` holds real names and a real reference number.
    - The Task Form uses **Office 365 Users**, which the deployment guide's connection list
      omits.

---

## 7a. Auditing (fixed 2026-11-05)

CORMS (SPFx) retired the `CORMS_AuditLog` list. Every CORMS audit write and read now goes to the
Elasticsearch index `integration.elasticAuditIndex` (`sslaudit`), reached at
`integration.elasticEndpoint` with `integration.elasticApiKey` (`AuditTrailServiceCore.ts`). CORMS
Approvals still wrote to the list, so none of its actions appeared in the correspondence Audit tab.

- **CORMS Approvals now writes to the index.** It goes through the new connector-free flow
  **CORMS - Audit Bridge** (`flows/CORMS-Audit-Bridge.json`). The flow's inputs are secured, so
  the API key stays out of run history.
- **Same document as CORMS writes:** `timestamp`, `action`, `application: "CORMS"`, `objectId`,
  `entity_id_record`, `entity_id`, `Details`, `userName`, `userEmail`, `SiteUrl`, `category`,
  `chainStatus`.
- **Same wording as CORMS:**
  - `Approval signature requested`, `Signed Document Saved`, `Approval signature completed`
  - `Approval Approved` / `Rejected` / `Returned`: "step approved", "asked for a change" in a
    signing round, and the delegation note for a delegate's decision.
- **Order:** entries are queued with the moment they happened and sent at the end of the timer
  tick. Entries in the same tick are 1 ms apart, so the Audit tab orders them as they happened.
- `integration.auditingEnabled = false` turns this off. A failed audit never blocks the action.
- **Tested on correspondence 420:** signature requested → signed document saved → signature
  completed → approved, interleaved correctly with the CORMS view entries.
- **Not reproduced:**
  - The "(on behalf of <user number>)" suffix: Power Apps can't read a person's SharePoint user
    ID. The details still say "by X on behalf of Y".
  - The " · document version N" suffix: Power Apps can't read a file's version label.
- **CORMS Task Form is unchanged.** CORMS doesn't audit task actions to the index, and the Task
  Form's own Audit tab still reads `CORMS_AuditLog`.

## 8. Gaps against the SPFx specs

Against `corms/docs/POWERAPPS-APPROVAL-TASK-STAGE2-CHANGES.md` (Stages 2-4, delegation, groups):

| Spec item | In the app? |
|---|---|
| Rule 1, latest round only | Yes |
| Rule 2/3, step status and status mapping | Yes |
| Rule 4.1, re-read before deciding | **No** (finding 8) |
| Rule 4.3, cancel all pending on Reject/Return | Yes |
| **Rule 4.5a, invalidate signatures** (`SigningSnapshotJson`, restore the version or swap `IsMainLetter`) | **No**, never referenced |
| Rule 4.6, round-specific closing Timeline text ("Review complete…", "Signed — every signer has signed", "asked for a change") | **No**, only the legacy "Correspondence approved…" |
| Rule 5, round label, "Request change", "Awaiting signature" chip | Yes (in the PCF) |
| §4, the four author notifications and the next-step notification | Yes |
| §4a, delegation `Status = Active` and `DecidedBy` "on behalf of" | **No** (finding 9) |
| §4a, SharePoint group tasks (`AssignedGroupId`, live membership) | **No** (finding 1) |

Against `corms/docs/POWERAPPS-REVIEW-FEEDBACK-3-CHANGES.md`:

| Item | Status |
|---|---|
| 1. Notification flow uses `emailSubject` / `emailBodyHtml` | **Not done.** Confirmed in the live `Notification_Flow` |
| 2. Approvals app creates the "Final confirmation:" task in `CORMS_Tasks` | **Done 2026-11-05.** `CORMS_Tasks` was added as a data source and the task is created in `tmrPanel.OnTimerEnd` after the author email. Tested: correspondence 427 produced TSK-2026-0048, which CORMS completed when it was sent for signing |

---

## 9. Working on this repository

1. **Re-sync from live after every batch of changes.**
   - Export **unmanaged** from the portal (Solutions → CORMS Approvals → Export).
   - Each `CanvasApps/*_DocumentUri.msapp` is a zip; its `Src/*.pa.yaml` files go into
     `approvals-app/` and `taskform-app/`.
   - Each `Workflows/<Name>-<GUID>.json` goes into `flows/<Name>.json`, pretty-printed.
   - Then run the checker.
   - Done once for 1.0.0.5.
2. **Export permissions.** The export needs read access to every component.
   - Sharing a flow does not share its connection references or environment variables; those are
     separate records.
   - The System Customizer role covers all of them at once.
3. **PCF changes:**
   - Build with `npm install && npm run build`, then `pac pcf push --publisher-prefix corms`.
   - Bump both the manifest `version` and `BUILD` in `index.ts`.
   - Then update the component inside each app. An app keeps its own embedded copy.
4. **After any portal edit**, run `tools/check_export_readiness.py` on a fresh export.

Suggested order:
- Finding 22 first: turn the overdue flow off. It is one switch, and it stops nightly changes to
  RecordsHub data.
- Findings 1, 2 and 3: wrong approvals and unsigned "signed" documents. (Finding 21 is fixed and
  finding 22's flow is off.)
- Then 5: the SPFx close listener. It is a small change in the SPFx repo and fixes visible UX.
- Then 6 and 7: the PCF signing iframe.
- Then the spec gaps in §8.
- Then fold the four copies of the chain logic into named formulas or functions, before making
  more rule changes.
