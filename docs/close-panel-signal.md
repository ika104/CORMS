# Closing the Power Apps panel from the SPFx page

**For:** the SPFx developer who maintains the CORMS task list web part
**Applies to:** the "New Task" and "View Details" panels that host the CORMS task canvas app
**Status:** the app side is done; the web part change is outstanding
**Cost:** none — no licence, connector, permission or API consent

## The problem

The panel hosts the canvas app in an `<iframe>` served from `apps.powerapps.com`. That is a
different origin from the SharePoint page, so:

- the app cannot close, resize or message the page around it;
- canvas apps have no JavaScript, so `window.parent.postMessage` is not available;
- `Exit()` only ends the app and leaves an empty purple "You have exited the app" frame.

Only the hosting page can close the panel. The app can therefore just **signal**, and the page
must watch for that signal.

## How the signal works

When the user finishes, the app navigates **its own frame** to a URL on the SharePoint domain and
puts the outcome in the URL hash. The frame and the page are then same-origin, so the page can read
the frame's address.

| The user… | The frame ends up at |
| --- | --- |
| Presses **Cancel** (or the app's ✕) | `https://ssloman.sharepoint.com/sites/CORMS/_api/web/title#corms=cancel` |
| **Creates a task** | `https://ssloman.sharepoint.com/sites/CORMS/_api/web/title#corms=created;ref=TSK-2026-0031` |
| Presses **Close** in the Approval Panel | `https://ssloman.sharepoint.com/sites/CORMS/_api/web/title#corms=close` |
| Presses **Open correspondence** in the Approval Panel | `https://ssloman.sharepoint.com/sites/CORMS/_api/web/title#corms=open:412` |

`close` is handled exactly like `cancel` — dismiss the panel. `open:<id>` means dismiss the panel and
navigate the host to `#/correspondence/<id>`; the number after the colon is the CORMS_Correspondence
list item id.

Notes:

- The part after `#` never reaches the server, so the landing page loads normally.
- `_api/web/title` is used only because it exists on every SharePoint site and returns one line of
  XML. Any URL on `ssloman.sharepoint.com` works; only the origin matters.
- The landing URL is a single formula in the app (`fxCloseUrl` in `App.pa.yaml`) if you ever want it
  pointed elsewhere.

### Sequence

1. The panel opens the app in the iframe (origin: `apps.powerapps.com`).
2. While the user works, any attempt by the page to read the frame's location throws a cross-origin
   error. Treat that as "not finished yet".
3. Cancel or a successful create runs `Launch(<marker URL>, {}, LaunchTarget.Replace)` in the app,
   which replaces the content of that same frame.
4. The frame is now on `ssloman.sharepoint.com`, so the page can read its location, and the browser
   fires the iframe's `load` event.
5. The handler reads the hash, closes the panel, and refreshes the list when the hash says a task was
   created.

## What the web part needs to do

### 1. Handle the iframe's `load` event

```tsx
const frameRef = React.useRef<HTMLIFrameElement>(null);

const checkSignal = (): boolean => {
  try {
    // Throws while the frame is still on powerapps.com — the normal case.
    const hash = frameRef.current?.contentWindow?.location.hash ?? "";
    if (hash.indexOf("corms=") === -1) return false;

    setPanelOpen(false);                 // close the panel
    if (hash.indexOf("created") > -1) {
      refreshTasks();                    // the new task's reference is in the hash: ref=TSK-…
    }
    return true;
  } catch {
    return false;                        // user is still working in the app
  }
};

<iframe ref={frameRef} src={appUrl} onLoad={checkSignal} … />
```

To read the reference number:

```ts
const ref = hash.split("ref=")[1];       // "TSK-2026-0031"
```

### 2. Optional: poll while the panel is open

Covers the case where the `load` event does not fire.

```tsx
React.useEffect(() => {
  if (!panelOpen) return;
  const id = setInterval(() => { if (checkSignal()) clearInterval(id); }, 400);
  return () => clearInterval(id);
}, [panelOpen]);
```

### 3. Do not sandbox the iframe

A `sandbox` attribute without `allow-same-origin` blocks the check.

### 4. Two small URL improvements while you are in there

```
https://apps.powerapps.com/play/e/default-ca6eb29c-124b-490a-ad27-08fd43267e29/a/89d30dd5-2425-4c96-8046-3a8ab59a6b3a
  ?tenantId=ca6eb29c-124b-490a-ad27-08fd43267e29
  &hidenavbar=true
  &source=iframe                        <- Microsoft's documented parameter for embedded apps
  &relatedCorrespondenceId=<id or reference>   <- only when raising a task from a correspondence
  &taskId=<CORMS_Tasks item ID>                <- View Details panel only
```

`relatedCorrespondenceId` makes the new task form preselect that correspondence (acceptance
criterion CMS-050.9). Parameters the app reads: `taskId`, `relatedCorrespondenceId`,
`subject=NeedApproval`, `securityTier`, `originatorEmail`, `documentUrl`. Anything else is ignored.

## Verifying

1. Open the New Task panel and press **Cancel**. The frame should land on
   `…/_api/web/title#corms=cancel` — a one-line XML response, not the purple exit screen.
2. With the panel open, run this in the browser console:

   ```js
   document.querySelector("iframe").contentWindow.location.hash
   ```

   It throws while the app is showing, and returns `"#corms=cancel"` after Cancel. That is exactly
   what the handler reads.
3. With the handler in place: Cancel closes the panel; creating a task closes it and refreshes the
   list.

## Why not something else

| Alternative | Why not |
| --- | --- |
| `postMessage` from the app | Canvas apps cannot run JavaScript |
| `Exit()` in the app | Ends the app, leaves an empty frame, panel stays open |
| PCF code component that calls `postMessage` | Works, but needs a component built and deployed, and still needs a listener in the web part |
| Premium connector or flow to signal the page | Requires Power Apps Premium licences |

## Related items this closes

- "Once a new task is created it should close the new task window and update the list of tasks."
- "New tasks once created should be on top of the list" — handled by the same refresh, if the list is
  sorted newest first.
