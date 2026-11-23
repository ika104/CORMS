# Closing the Power Apps panel from CORMS

**Applies to:** the "New Task" panel in CORMS My Tasks, which hosts the CORMS Task Form
**Status:** done. Task Form published 2026-11-07, CORMS package 1.0.0.39

## The problem

CORMS shows the canvas app in an `<iframe>` served from `apps.powerapps.com`, a different origin
from the SharePoint page. Canvas apps have no JavaScript, so the app can't message the page. Only
the page can close the panel.

Two URL-based signals were tried and **don't work**:

- `Launch(url, {}, LaunchTarget.Replace)` from the embedded app replaces the **whole browser tab**,
  not the frame. Users landed on the signal URL (a blank image, earlier an XML page).
- `Launch(url, {}, "<frame name>")` with the iframe's name opens a **new tab**: the player doesn't
  find the named frame.

Microsoft documents that any target other than `LaunchTarget.New` is unsupported in embedded apps.

## How it works now

1. CORMS (`PowerAppsFormModal`) loads the app with `cormsHost=1` added to the frame's URL. The
   "Open in new tab" link doesn't get it.
2. The Task Form holds an invisible code component, **CORMS Host Signal** (`pcf-host-signal/`,
   `corms_CORMS.HostSignal`). When its `Signal` property changes, it posts this message to every
   window above the app:

   ```json
   { "type": "corms:host-signal", "signal": "cancel" }
   ```

   `signal` is `cancel`, or `created;ref=TSK-2026-0051` after a task is created. The app adds
   `@<timestamp>` to the property so a repeated signal still counts as a change; the component
   strips it.
3. CORMS accepts the message only when its source is the panel's own frame or a frame inside it,
   then closes the panel. After a create, My Tasks refreshes.

In the app (TaskCreateScreen, Cancel button; Create calls it with `varCloseReason` set):

```
If(
    Param("cormsHost") = "1",
    Set(varHostSignal, Coalesce(varCloseReason, "cancel") & "@" & Text(Now(), "yyyymmddhhmmssfff")),
    Launch(fxSiteUrl & "#/my-tasks", {}, LaunchTarget.Replace)
)
```

Opened on its own (no `cormsHost`), Cancel goes back to CORMS My Tasks.

## Not covered

- The Task Details and Approvals panels don't send a signal; users close them with the X.
- The message carries only the signal and a task reference, so it is posted to any origin (`*`).
