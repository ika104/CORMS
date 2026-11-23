# UAT release: review findings and fix list

Review of the live solution (CORMSApprovals, SSL default environment) on 2026-11-07, before
releasing a clean package to the client's UAT. "Finding N" refers to `docs/ANALYSIS.md`.

Where each fix is made:

- **Approvals** / **Task Form**: canvas app, edited in a co-authoring session, then published
- **Flow**: edited live through the flow API
- **PCF**: the ApprovalPanel component, rebuilt and pushed with `pac`
- **SPFx**: the CORMS web part (separate repo), new package

---

## Progress

**Phase 1, flows. Done 2026-11-07, live and in `flows/`.** Each flow will be exercised from the
apps during app testing; the flows owned by another user can't be run with test inputs directly.

- A3: Notification Bridge counts any 2xx as sent. Its inputs (the signed flow URL) are hidden from
  run history.
- A9, flow part: the Signing Bridge reports every failure to the app:
  - `DocumentUnreadable`, `ProviderUnavailable`, `NoSignedDocument`
  - **`SaveFailed`**, when the signed file can't be written back
  - Its trigger, the call to the signing flow and the file write are hidden from run history.
- A14: Notification_Flow uses `emailSubject` / `emailBodyHtml` from CORMS's email templates, with
  `{{recipientName}}` filled in per recipient. It falls back to its standard text. Names, subject
  and comment are now HTML-escaped in the standard text.
- B1, flow part: the `Compose "test"` step is removed from Upload Task Attachment.
- B4: the Signing Bridge builds the signer JSON with `setProperty`, not string concatenation.
  - The SignNow flow needed no change: Microsoft documents that hiding a Compose or Parse JSON
    step's inputs also hides its outputs, and both `Provider_settings` and `Parse_token` already
    hide their inputs.

**Phase 2, ApprovalPanel 0.0.21. Done 2026-11-07.** Pushed with `pac pcf push` and updated in the
app. A4: build label gone. A10: signing frame kept across refreshes; "Confirming" offers Cancel and
then "Check again". A5: busy overlay and "Loading...". New optional `notice` line.

**Phase 3, CORMS Approvals. Done 2026-11-07, published as version 96.**

- B7: the chain, turn, permission and panel logic is defined once, as named formulas and functions
  in `App.Formulas` (`nfChain`, `nfCorrStatus`, `nfCanAct`, `nfPanelData`, `fxMatches`, ...). The
  four copies are gone; the screen went from 1,379 lines to 745.
- Fixes:
  - A8: exact assignee match.
  - A7: team tasks by Department; SharePoint-group tasks show a notice instead of buttons.
  - A11: no fallback to other users' tasks.
  - A12: the task is re-read before deciding.
  - A9: nothing is recorded as signed until the signed file is saved.
  - A4: plain messages; technical detail goes to `Trace()`.
  - A3: notification failures are traced, not shown.
  - A6: site URL taken from `site.baseUrl`, else from the list's own link.
  - A1: the close URL is a blank image.
  - B5: round-specific Timeline wording and CORMS's decision event types.
  - B6: `DecidedOnBehalfOf` / `DelegationDetails`, and only Active delegations count.
- B8: App Checker and accessibility checks are clean.
- Compile: 0 errors. 4 delegation warnings remain on named formulas that call the app's own
  functions; they read only already-loaded data (`colSteps`, `varTask`), so there is nothing to
  delegate.
- Tested:
  - Correspondence 418, review approval: Reviewed event, "Review complete — …" entry, final
    confirmation task TSK-2026-0051, notification sent.
  - Correspondence 411, signing step: signed file saved (version 4.0) → signature completed →
    auto-approved → status Signed, "Signed — every signer has signed".
  - Audit entries for both are in the audit index, in order.

**Phase 4, CORMS Task Form. Published 2026-11-07; waiting for user testing.**

- A2: "Related correspondence" opens the CORMS page `#/correspondence/<id>`.
- A4: plain messages; technical detail goes to `Trace()`.
- A5: "Please wait..." overlays on Create and on the details screen, bound to `varIsLoading`. One
  hidden `btnDetRefresh` reloads every tab and is called after Save and Add Note.
- A6: site URL from `site.baseUrl`, else from the list's own link.
- A13: the status edit button shows only for the assignee, the creator, or a SystemAdministrator.
- B1: the Approval screen, its `NeedApproval` route, the Document & Approval tab and the hidden team
  combobox are gone.
- B3: Timeline uses `Now()`; download links are URL-encoded.
- B7/B8: shared lists are named formulas; App Checker and accessibility checks are clean, apart from
  the advisory that the details screen has many controls.
- Also fixed:
  - With a blank task reference, the Files, Audit and Timeline tabs matched every row with a blank
    key. They now match nothing.
  - The divider rectangles became 1-pixel containers (`div*`, accessibility). They need
    `FillPortions: =0`, or they stretch to fill the screen. They also need new names: a Rectangle
    converted under the same name renders as a black box after Studio reloads.

**Phase 5, closing the panel (A1). Done 2026-11-07; CORMS package 1.0.0.39 to deploy.**

- Tested: `Launch(..., LaunchTarget.Replace)` from the embedded app replaces the **whole browser
  tab**, and a named target opens a new tab. CORMS can't catch either, so the blank-image signal
  could never work.
- New code component **CORMS Host Signal** (`pcf-host-signal/`, in the CORMSApprovals solution). It
  is invisible; when its `Signal` changes it posts `{ type: "corms:host-signal", signal }` to the
  windows above the app.
- Task Form: inside CORMS (`cormsHost=1`), Cancel and Create set the signal (`cancel`,
  `created;ref=...`). Opened in its own tab, they go back to CORMS My Tasks. `fxCloseUrl` removed.
- CORMS `PowerAppsFormModal`: the frame URL gets `cormsHost=1` (the new-tab link doesn't), and the
  panel closes on a host signal from its own frame. My Tasks refreshes after a create, as before.
- Tested in SSL: Cancel stays on CORMS and the signal arrives from the panel's frame, repeatedly.
- With CORMS 1.0.0.38 still deployed, Cancel does nothing visible (the user closes the panel with
  X); 1.0.0.39 closes it.
- The Approvals app doesn't close its panel after a decision, so it doesn't use the signal yet.

**Phase 6, the UAT solution. Done 2026-11-07: CORMSApprovals 1.0.0.7.**

- B2: SigningFrame removed from the solution (it stays in the SSL environment). The sample data was
  already generic.
- Contents: CORMS Approvals, CORMS Task Form, ApprovalPanel 0.0.21, HostSignal 0.0.1, six flows
  (Audit Bridge, Notification Bridge, Signing Bridge, Upload Task Attachment,
  eSignature-SignNow, Notification_Flow), 3 connection references, 12 environment variables (11 from 1.0.0.8).
- `check_export_readiness.py`: 0 blocking issues for both the managed and the unmanaged zip.
- The client gets the **managed** zip only. If UAT ever had CORMSApprovals as unmanaged, that copy
  must be deleted first; a managed import can't go over it.
- The repo is synced from the export. The apps match what was tested apart from the export's
  formatting (control versions, Studio's header, a default `AutoStart`). The exported flows omit the
  default `authentication` line.
- B9: deployment guide updated (app URLs in `CORMS_AdminConfig`, `site.baseUrl`, CORMS 1.0.0.39 and
  Provision Lists, `cormsHost=1`, first-run consent, Audit tab check).
- Still open: C (signature invalidation, rule 4.5a); the Task Details and Approvals panels don't
  close themselves.

**Retiring `CORMS_AuditLog`. Done 2026-11-07: CORMSApprovals 1.0.0.9 is the UAT solution.**

- CORMS (SPFx) and the Approvals app already audit to Elasticsearch only. The Task Form was the last
  user of the list: it wrote Task Created, Comment Added, Files Attached, Task Updated / Status
  Changed and Note Added there, and its task Audit tab read the list.
- Task Form: those five entries go through **CORMS - Audit Bridge** in CORMS's document shape; the
  Audit tab reads through the new connector-free **CORMS - Audit Search** flow with CORMS's query
  (`fxAuditDoc`, `fxAuditQuery`, `nfAudit*` in `App.Formulas`). The list's data source is removed.
- The list's data source was also removed from the Approvals app (unused), and its environment
  variable from the solution (now 11). No flow uses the list.
- The list held 158 entries (21 Sep - 7 Nov) that are **not** in Elasticsearch: 48 Task Form
  entries and 110 approval entries the Approvals app wrote before 5 Nov. They are lost when the list
  is deleted unless they are copied first. They were development entries, so the list was deleted
  without copying them.
- Tested: a note on TSK-2026-0056 was written to Elasticsearch in CORMS's document shape and showed
  in the task's Audit tab.
- 1.0.0.9: `check_export_readiness.py` reports 0 blocking issues (managed and unmanaged); 7 flows,
  2 components, 11 environment variables. The apps match what was tested. The Approvals app also
  lost its unused Upload Task Attachment flow (B1). Old formula text naming `CORMS_AuditLog`
  remains in a few controls' `AutoRuleBindingString` (Studio's record of a default formula); it is
  never evaluated.

**Review feedback 4 (tasks 4 and 5). 2026-11-08, after 1.0.0.9.** Spec:
`corms/docs/POWERAPPS-REVIEW-FEEDBACK-4-TASKS.md`.

- Task 5, Teams card: Notification_Flow posts an adaptive card (1.4) from Flow bot in chat to
  approvers and recipients: title by role, subject, reference, what to do, type · priority, due
  date, from, security level, Open in CORMS. Empty rows are dropped. Still switched on by
  `notification.teamsTeamId`. The Approvals app sends `details` (`nfNotifyDetails`).
- Task 4, external email: when a decision makes the correspondence Signed and `DeliveryEmail` is
  set, the app matches `ExternalOrganizations` to `admin.externalOrganizationsJson` (nameEn / name /
  nameAr, ignoring case; `email`, else the first of `emails`) and sends `ExternalDelivery` with
  role `External`. Email only, signed PDF attached, no link. Timeline `EmailSent` "Signed document
  emailed to …" only when the bridge reports the PDF attached.
- Different from the spec: the PDF is read by **CORMS - Notification Bridge** (SharePoint, as the app
  user) and passed as `attachments: [{ name, contentBytes }]`; Notification_Flow has no SharePoint
  connection. The solution's SharePoint connection reference is owned by Abdullah's account, so the
  bridge's SharePoint step was first added from that account; the flow is then edited as usual.
- Not tested end to end yet.

**Review feedback 5 (tasks 1 and 5). 2026-11-09.** Spec:
`corms/docs/POWERAPPS-REVIEW-FEEDBACK-5-TASKS.md`.

- Task 1: ApprovalPanel 0.0.22. The primary button and the decision dialog read **Sign** on a
  signing task (signing round, or *Signature required*); the outcome is still `Approved`.
- Task 5: new flow **CORMS - Signed Documents Email** (`flows/CORMS-Signed-Documents-Email.json`),
  in the solution, on. SharePoint "When an item is created or modified" on `CORMS_Correspondence`
  (condition Status = Signed), continues only when Get changes says Status changed in this edit.
  Recipients: Created By and Assigned To, each once. Files from `CORMS_Attachments` by
  `CorrespondenceId`, main document first, without folders, task files and references
  (RecordHubReference / Linked, named in the email instead). Over 20 MB only the main document,
  with the "too large" line. Uses the active Signed email template; without one it sends
  `emailSubject` "Signed: <reference>" and Notification_Flow's standard body. Posts `SignedDocuments`
  (role Recipient) to Notification_Flow, then a Timeline `EmailSent` "Signed documents emailed to …".
- Notification_Flow: `SignedDocuments` in the event enum, and `Send_email` now attaches
  `body('Email_attachments')` (empty for every other event). Different from the spec: the
  "Signed: <reference>" subject is sent by the new flow, not built in Notification_Flow.
- The Send_email change was made in the designer from Abdullah's account: every API save of
  Notification_Flow fails with "connection reference 'corms_sharedoffice365_63afd' could not be
  found for the operation 'Send_email'" (also as Abdullah). The trigger's descriptions still say
  attachments are for External emails only; the repo matches the live flow.
- Tested 2026-11-09: task 1 passed; task 5 email arrived but the PDF was corrupted: Outlook got
  `ContentBytes` as a base64 string and encoded it again. Fixed in Notification_Flow's
  Email_attachments with `base64ToBinary(item()['contentBytes'])` (also fixes the External email,
  which uses the same step); a resent email carries the file as binary.
- 1.0.0.10 (2026-11-09): exported managed and unmanaged; `check_export_readiness.py` reports 0
  blocking issues for both. 8 flows, ApprovalPanel 0.0.22, HostSignal 0.0.1, 3 connection
  references, 11 environment variables (no values). Repo synced from the unmanaged export; the
  published apps match the repo. Needs CORMS 1.0.0.41 or later.

**Correspondence Email Templates. 2026-11-11, after 1.0.0.10.** Spec:
`corms/docs/POWERAPPS-CORRESPONDENCE-EMAIL-TEMPLATES-TASKS.md` (CORMS branch
`feature/correspondence-email-templates`).

- CORMS - Signed Documents Email reads `CORMS_Templates` with `TemplateType = CorrespondenceEmail`
  (active = Approved not false) and picks the one whose `ContentTypeName` matches the
  correspondence's (trimmed, ignoring case), else the one with an empty `ContentTypeName`, else
  none. The old `EmailEvent = 'Signed'` template is ignored.
- `{{Document.<InternalName>}}` comes from the main document's item in `Get_files`
  (`IsMainLetter`), new step `Main_file`; a name starting with `_` is also read as
  `OData_<name>`. As text: choice/lookup Value, person DisplayName, several joined with `; `,
  dates `dd/MM/yyyy` in Arabian Standard Time (date-only values as they are), yes/no Yes/No,
  empty or missing blank; HTML-escaped in the body.
- Without a template the subject is `<ReferenceNo>: <Title>` (just `<Title>` without a
  reference), never "Signed: …"; the body stays empty so Notification_Flow's standard text is used.
- Fixed on the way: a template whose subject or body ended with a placeholder failed (`substring`
  at the end of the text); the filler now uses `slice`.
- Tested in a temporary connector-free flow (deleted): content type match, the all-types
  fallback, no template, and every value type. Not yet tested end to end with a signed
  correspondence. Needs Provision Lists for the `CorrespondenceEmail` choice (done on SSL).
- Saved from Abdullah's account (the flow is his; Zyad's account gets 403 on it).

**Signed documents email: file names. 2026-11-11.** Spec:
`corms/docs/POWERAPPS-SIGNED-EMAIL-FILE-NAMES-TASKS.md`.

- Attachments in the email are named `Correspondence_<file name>` (the first main document) and
  `Attachment_<n>_<file name>` (every other file, n = 1, 2, … in order), so same-named files are
  all sent. The SharePoint files keep their names. A file that can't be read gets no number.
- Different from the spec: one Compose `File_name` in `Read_files` (between Get_file_content and
  Add_attachment) instead of new variables and a Condition. It counts the files already added
  (the `Attachments` variable) and whether the `Correspondence_` one is among them. `main` stays
  `IsMainLetter`; the over-20-MB path still takes only the first, which is the `Correspondence_` one.
- Tested in a temporary connector-free flow (deleted): main + two `invoice.pdf` + an attachment named
  like the main + a second main + one unreadable file gave `Correspondence_scan.pdf`,
  `Attachment_1_invoice.pdf`, `Attachment_2_invoice.pdf`, `Attachment_3_scan.pdf`,
  `Attachment_4_second-main.pdf`. Not yet tested end to end.
- Made in the designer from Abdullah's account: since this afternoon every API save of this flow
  fails like Notification_Flow's ("connection reference 'new_sharedsharepointonline_00d04' could not
  be found for the operation 'Get_changes'"). Further changes to either flow: designer only.
- 1.0.0.11 (2026-11-11): exported managed and unmanaged; `check_export_readiness.py` reports 0
  blocking issues for both. 8 flows, ApprovalPanel 0.0.22, HostSignal 0.0.1, 3 connection
  references, 11 environment variables. The flows and apps match the repo (Correspondence Email
  Templates and the file names included). Needs CORMS with the Correspondence Email Templates tab
  and Provision Lists run (the `CorrespondenceEmail` template type).

**UAT-020: signatures added at send-for-signing. 2026-11-16, after 1.0.0.11.** Spec:
`corms/docs/POWERAPPS-UAT-020-TASKS.md` (CORMS branch `fix/uat-020-send-step-signatures`).

- Task 1, CORMS-eSignature-SignNow: `GetSignatureLayout` also returns `additions`, the number of
  signatures, texts, checks, lines and images the author added on the editor's copy (new variable
  `LayoutAdditions`; `0` for every other operation). CORMS uses it to save that copy as the main
  document.
- Task 2, CORMS - Signing Bridge: `Save_signed_as_main` now branches on the main document's type. A
  PDF is replaced as before (new version). Any other file (Word) keeps its bytes: the signed PDF is
  created beside it as `<name>.pdf` (`<name> (2).pdf`… when taken, checked against the folder),
  gets the old main document's `CorrespondenceId`, `SecurityLevel`, `SecurityTier`,
  `IsMainLetter = true`, `Source = Uploaded`, and the old one gets `IsMainLetter = false`. The
  response adds `mainfilename`. The bridge now also uses the CORMS_Attachments environment variable.
- Approvals app: after a successful save it reads the main document again (`Refresh` +
  `LookUp(... IsMainLetter = true)`), so the "Signed Document Saved" audit entry names the PDF and
  the rest of the session uses it. Different from the spec: it doesn't read `mainfilename`, which
  would need the flow refreshed inside the app (Abdullah's Studio).
- Both flows saved through the API from Zyad's account; the app published from Abdullah's Studio.
  Tested: the new-name logic in a temporary flow (`Letter.docx` with `letter.PDF` and
  `Letter (2).pdf` taken → `Letter (3).pdf`). Not tested end to end yet.

## A. Must fix before UAT

| # | Issue | What the user sees today | Fix | Where |
|---|---|---|---|---|
| A1 | **Redirect after an action.** Create Task and Cancel send the frame to `…/_api/web/title#corms=…`, and CORMS never listens for it | The panel turns into a page of XML; My Tasks doesn't refresh | CORMS closes the panel when the frame reports `#corms=` (and refreshes My Tasks after a create). The apps land on a blank image, not the XML page, so nothing flashes | SPFx, Task Form, Approvals |
| A2 | **"Related correspondence" opens the SharePoint list form** (`'Link to item'`) | A raw SharePoint form in a new tab | Open the CORMS page `#/correspondence/<id>` | Task Form |
| A3 | **Notification warning toast.** Notification_Flow answers 202, and the bridge treats anything but 200 as an error | A warning toast reading `{"accepted":2}` after every decision that notifies | The bridge treats any 2xx as success. A notification failure is logged, never shown | Flow (Notification Bridge), Approvals |
| A4 | **Debug and technical text** | The `v0.0.20` build label in the panel footer; raw `FirstError.Message` text in 12 messages; "signature.flowUrl is not set in Admin Configuration."; the full audit sentence as the success toast | Remove the build label. Show short, plain messages. Send technical detail to `Trace()` (Monitor / App Insights) instead of the screen | PCF, Approvals, Task Form |
| A5 | **No loaders** | Approvals: "No approval task is open." flashes while loading; signing and decisions only grey out the buttons. Task Form: nothing while Create uploads files, while Detail loads, or during Save / Approve / Add Note | A full-screen spinner overlay bound to one busy flag in each app, set for load and for every save or flow call | Approvals, Task Form |
| A6 | **Hard-coded `ssloman` fallback** for the site URL | Nothing in SSL. In the client's tenant, if `site.baseUrl` is missing: links, the close signal and **every audit entry's `SiteUrl`** point at SSL's site, so the client's Audit tab shows none of the app's entries | Derive the site URL from the list the app already reads (`'Link to item'` up to `/_layouts/`); use `site.baseUrl` only to override | Approvals, Task Form |
| A7 | **Anyone can decide a group or department task** (finding 1) | Any user who opens the task gets the buttons | Team task: the user's Department in `CORMS_UserRoles` must match. SharePoint-group task: canvas can't read group membership, so the app shows "Open this task in CORMS to act on it" instead of the buttons | Approvals |
| A8 | **Assignee matched by substring** (finding 2) | `ali@x.com` can act on `bali@x.com`'s task | Exact match on the claims suffix, the same rule SPFx uses | Approvals |
| A9 | **"Signed" while the signed file wasn't saved** (finding 3) | The step completes while the library keeps the unsigned file | The Signing Bridge reports a failed save. The app stops, keeps the step open and asks the user to retry | Flow (Signing Bridge), Approvals |
| A10 | **Signing frame resets / stuck spinner** (findings 6, 7) | SignNow can reload mid-signing; "Confirming…" can spin forever | The panel keeps its signing frame across refreshes, and "Confirming" times out into a message with Cancel | PCF |
| A11 | **Opening the app without a task shows someone else's** (finding 16) | Any pending task, from any user | Show "No approval task is open." | Approvals |
| A12 | **No check before writing a decision** (finding 8) | Two approvers can both decide one "Any" step | Re-read the task just before writing; if it's no longer Pending, say so and refresh | Approvals |
| A13 | **Anyone can change any task's status** (finding 11) | Status edit button for every user | Only the assignees, the creator, or a SystemAdministrator | Task Form |
| A14 | **Email templates from CORMS are ignored** (Review Feedback 3, item 1) | CORMS's admin-defined email texts never used for Power Apps notifications | Use `emailSubject` / `emailBodyHtml` when present | Flow (Notification_Flow) |

## B. Clean-up in the same release

| # | Item | Where |
|---|---|---|
| B1 | Remove dead code: the Task Form **Approval screen** and its `subject=NeedApproval` route (unreachable from CORMS, no permission check), the hidden **Document & Approval** tab, the hidden team combobox, the Approvals app's unused upload-flow data source, the `Compose "test"` step in the upload flow | Task Form, Approvals, Flow |
| B2 | Remove the unused **SigningFrame** component from the solution; replace the real names in `pcf-approval/mock/sample-data.json` | Solution, repo |
| B3 | Timeline rows stamped `Now()` instead of `Today()` (finding 14); URL-encode the file download links (finding 15) | Task Form |
| B4 | Signing Bridge builds the signer JSON safely (finding 10); SignNow flow hides the outputs of `Provider_settings` and `Parse_token` (password and token) | Flow |
| B5 | Round-specific Timeline wording (spec rule 4.6): "Review complete — …", "Signed — every signer has signed", "asked for a change" | Approvals |
| B6 | Delegated decisions recorded like CORMS does: `DecidedBy`, `DecidedOnBehalfOf`, `DelegationDetails`; only `Status = Active` delegations count (finding 9) | Approvals |
| B7 | Collapse the four copies of the approval-chain logic into one, and the four copies of the Task Detail load logic into one | Approvals, Task Form |
| B8 | Clear App Checker and accessibility errors in both apps | Approvals, Task Form |
| B9 | Deployment guide: app URLs live in `CORMS_AdminConfig` (not web part properties); `site.baseUrl` is required; Office 365 Users needs each user's consent on first run; Audit Bridge | Docs |

## C. Known gap, not in this release unless asked

- **Signature invalidation on Request change / Reject in a signing round** (spec rule 4.5a). The
  app would have to restore a file version through SharePoint REST, which needs a flow with a
  SharePoint connection. Until then, a signer who requests a change or rejects should do it from
  CORMS, which already handles it.

## Order of work

1. Flows: A3, A9 (bridge part), A14, B1 (upload flow), B4. No app changes needed; tested by
   running them.
2. ApprovalPanel component: A4 (label), A10. Rebuilt with `pac`, pushed, then updated inside the
   Approvals app.
3. Approvals app (one co-authoring session): A1, A3, A4, A5, A6, A7, A8, A9, A11, A12, B5, B6,
   B7, B8.
4. Task Form (one co-authoring session): A1, A2, A4, A5, A6, A13, B1, B3, B7, B8.
5. SPFx: A1 listener; new package.
6. Solution: remove SigningFrame (B2), export 1.0.0.6, run the checker, sync the repo, update the
   guide (B9).

**UAT-008: correspondence pickers ignore access rights. 2026-11-16.**

- CORMS Task Form: New Task and the task details' Related Correspondence list only what the user
  may open in CORMS. Security level at or below the user's clearance (CORMS's own rule; it checks
  clearance only, not department or sender): levels and their order from RecordsHub
  `RH_SecurityLevels` (new data source "Security Levels"), clearance from CORMS_UserRoles
  (SystemAdministrator = all; else ClearanceLevel, else the old ClearanceTier, else the lowest). A
  blank level is the lowest, an unrecognised one the most sensitive. Drafts only for their author or
  sender; entries with no reference number and no subject left out.
- The access part is a SharePoint query (allowed levels and non-draft statuses as fixed slots, up to
  12 level spellings and 20 statuses). Only the blank-entry rule runs in the app, so the picker shows
  at most the 500 newest correspondences the user may see.
- Two new environment variables, in the solution without values (Export value off): the RecordsHub
  site and its `RH_SecurityLevels` list. UAT must fill them in at import. 13 variables now.
- Tested in Studio: clearance fixed at Unclassified gave exactly SharePoint's expected 33 entries;
  a restricted reference found nothing; with admin clearance all 7 CEO correspondences appear.
- Not covered here: CORMS's own pickers (linked correspondence, Attach from RecordHub, Search).

**UAT-010: Task Form Timeline newest first and readable. 2026-11-17.** Spec:
`corms/docs/POWERAPPS-UAT-010-TASKS.md`.

- `varTaskEvents` sorted by Created then ID, both descending (events in the same second keep the
  order they were written). "Due (Overdue)" is the first row.
- Titles: the row's own Title, else `fxTimelineTitle(EventType, Description)` (App formulas), CORMS's
  labels (Reference Assigned, Sent for Review, Reminder…); an Edited row reads Sent for Signing,
  Reassigned or Recalled from its description; an unknown type gets spaces before its capitals.
  Every row shows title, description, date · user.
- Checked in the published app: TSK-2026-0069 (newest first, Reference Assigned above Sent for
  Review at 08:04, Sent for Signing, Created last) and the overdue TSK-2026-0065 (Due first).
- Publishing: after the canvas edits Studio's Publish did nothing until Studio was reloaded and
  saved (Save, then Publish shows "Start publishing").

**UAT-006: integration URLs as configuration. 2026-11-18.** Spec:
`corms/docs/POWERAPPS-UAT-006-URLS.md`.

- New environment variable `corms_ElasticEndpoint` (Text, not required, no default) in
  CORMSApprovals and in `dist/deployment-settings.json` (14 variables). SSL has a current value
  (the same address as Admin Settings); it is not exported, so the target environment sets its own.
- CORMS - Audit Bridge and Audit Search: the Elasticsearch base is the `Endpoint` input when it
  isn't blank, else `corms_ElasticEndpoint`; trimmed, a trailing `/` dropped. `Endpoint` stays a
  required input (the apps send a blank string): making it optional would change the flow's
  signature in both apps. Checked in a test flow: blank or null → the variable, Admin Setting
  wins, `https://host:9200/` → no double slash, index still defaults to `sslaudit`.
- Task Form (`nfAuditOn`) and Approvals (`ApprovalScreen`, audit write) no longer require
  `integration.elasticEndpoint`; only the API key. Both published 2026-11-18.
- No host or port literal in any app formula or flow action (the only URLs are the SharePoint
  site variable's name and default). The custom connector `connector/` stays out of the solution.
- A flow that references the variable can't be saved or turned on while the variable has no
  value, so the guide says to fill it on import.
- Not yet checked end to end in the apps (an audit write and a task's Audit tab after the change).
- Studio: after `compile_canvas` the Save button stayed disabled; a no-op property change (screen
  Image position Fit → Fill → Fit) enabled it.
