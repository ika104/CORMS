# E-signature setup

CORMS sends a correspondence document for signature through **one Power Automate flow**. The
SharePoint app only calls that flow; the flow handles all communication with the signing provider.
Operations, statuses, and field names in the contract below are provider-neutral, so you can change
provider by replacing the flow's provider actions, with no change to CORMS.

All settings are managed on **Administration → Admin Config**. None are hard-coded in the flow.

## 1. Provision the settings

Run **Administration → Provision Lists → Create / Update All Lists**. This adds these rows to
`CORMS_AdminConfig` (Integration category):

| Key                                     | Read by | Value                                                              |
| --------------------------------------- | ------- | ------------------------------------------------------------------ |
| `signature.flowUrl`                     | CORMS   | HTTP-trigger URL of the signing flow (step 3)                      |
| `signature.providerBaseUrl`             | Flow    | Provider API base URL, no trailing slash (for example `https://api.signnow.com`) |
| `signature.providerClientCredentials`   | Flow    | Base64 of `clientId:clientSecret` (SignNow calls this the Basic authorization token) |
| `signature.providerUsername`            | Flow    | Service account username (email)                                   |
| `signature.providerPassword`            | Flow    | Service account password                                           |

On sites set up before this change, the same run moves these unused rows to the site recycle bin:
`signnow.apiToken`, `signnow.apiBaseUrl`, `signnow.brokerUrl`, `signature.providerApiToken`.

### Protect the secret rows

Admin Config is a normal SharePoint list, and CORMS reads it in each user's browser. Anyone who
can read the list can read these values. For the `signature.providerClientCredentials` and
`signature.providerPassword` rows, turn off inherited permissions and give access only to site
administrators and the account that owns the flow's SharePoint connection.

## 2. Import the flow

[`signing-flow.signnow.json`](signing-flow.signnow.json) is the SignNow implementation, in the
format the Power Automate Tools editor saves. Before pasting it over the existing flow's definition:

1. Replace `PASTE_SHAREPOINT_CONNECTION_NAME` with the name of a SharePoint connection in the
   environment. In Power Automate, open **Connections**, then the SharePoint connection. The name
   is the segment after `/connections/shared_sharepointonline/` in the address bar.
2. In **Get provider settings**, replace `https://TENANT.sharepoint.com/sites/CORMS` with the CORMS
   site URL. The site address tells the flow where Admin Config is, so it stays in the flow.
3. Save. Pasting over the existing flow keeps its HTTP trigger URL.

The flow reads the `signature.provider*` rows on every run. If any is empty, it returns
`500 Signing provider settings are incomplete`. Settings, provider HTTP calls, and the access token
use secure inputs/outputs, so they are hidden in run history.

## 3. Connect CORMS to the flow

Set `signature.flowUrl` in Admin Config to the trigger URL from step 2. Until it is set, **Send for
e-Signature** shows a "not configured" error.

## Flow contract

Create a signing request:

```json
{
  "operation": "CreateSigningRequest",
  "correspondenceId": "…",
  "referenceNumber": "…",
  "subject": "…",
  "document": { "fileName": "document.pdf", "contentBase64": "<bytes, base64, no data: prefix>" },
  "signers": [
    {
      "name": "Full Name",
      "email": "name@example.com",
      "signingOrder": 1,
      "placement": { "page": 1, "x": 70, "y": 85, "width": 20, "height": 8 }
    }
  ],
  "returnUrl": "https://tenant.sharepoint.com/_layouts/15/images/blank.gif?cormsSigning=1"
}
```

CORMS shows the signing page inside the app, in a frame. `returnUrl` (optional) is where the flow
must send the signer when the page ends, adding `signingResult=completed`, `declined` or `closed`
to its query string. The SignNow flow passes these as the invite's `redirect_uri`,
`decline_redirect_uri` and `close_redirect_uri` with `redirect_target` `self`. Because the return
address is on the CORMS site, the app can read it, closes the signing window and checks the
signature. Without it the signer closes the window with **Done**; an **Open in new tab** link is
always available if a provider refuses to load in a frame.

`placement` is the signature box the requestor set in CORMS: `page` counts from 1, and `x`, `y`,
`width` and `height` are percentages of the page measured from its top-left corner. The SignNow
flow reads the page size from the uploaded document and converts the box to SignNow's
coordinates; it uses CORMS's default box when `placement` is absent.

Response:

```json
{ "externalDocumentId": "…", "signingUrl": "https://…", "status": "Pending", "isCompleted": false }
```

Read the signing status:

```json
{ "operation": "GetSigningStatus", "externalDocumentId": "…" }
```

Response:

```json
{ "externalDocumentId": "…", "status": "Completed", "isCompleted": true }
```

CORMS unlocks a signature-required approval only when `isCompleted` is `true`. A signing link on
its own never unlocks it. The flow decides completion from the provider's response (for SignNow,
the field invite status `fulfilled`).

Download the signed document:

```json
{ "operation": "GetSignedDocument", "externalDocumentId": "…" }
```

Response:

```json
{ "externalDocumentId": "…", "contentBase64": "<signed PDF, base64>", "status": "Completed" }
```

All signers sign **one** document. When CORMS confirms a signature it downloads the signed PDF and
saves it as the correspondence's main document: a main PDF is replaced (SharePoint keeps every
signed version in the file's version history); a Word or linked Records Hub main document is kept
and the PDF is added beside it as the new main document. The next signer is sent that signed PDF,
so the final main document carries every signature. CORMS keeps signature boxes from overlapping,
moving a signer who shares a step's box (for example in an "All" group) to the next free spot.

The SignNow flow invites the first signer only.

## Replacing the provider

Keep the trigger, **Get provider settings**, and the two responses. Replace the actions inside
**Try signing provider** with the new provider's calls, and map its results to
`externalDocumentId`, `signingUrl`, `Completed`/`Pending`, and the signed PDF for
`GetSignedDocument`. If the new provider needs different
settings, add `signature.provider*` rows in Admin Config and read them in **Provider settings**.

## Signed-document callback (not included)

To mark a session **Signed** on the Signing Dashboard when the signer finishes, add a provider
webhook → Power Automate flow that updates the `CORMS_SigningSessions` row (matched on
`ExternalDocumentId`) and saves the signed PDF to SharePoint. That is a separate piece of work.
