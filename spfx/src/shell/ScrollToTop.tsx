import * as React from 'react';
import { useLocation } from 'react-router-dom';

/** The id given to AppShell's route outlet, the anchor from which we locate the scroll container. */
export const ROUTE_OUTLET_ID = 'corms-route-outlet';

/** Walks up from `start` to the nearest actually-scrollable ancestor (the SharePoint page container
 * that owns the scroll when the app is embedded), so scroll-to-top targets whatever is really
 * scrolling rather than assuming it's the window. */
function findScrollableAncestor(start: HTMLElement | undefined): HTMLElement | undefined {
  let el = start?.parentElement ?? undefined;
  while (el) {
    const style = window.getComputedStyle(el);
    const scrolls = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrolls && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement ?? undefined;
  }
  return undefined;
}

/**
 * Every in-app navigation should land at the top of the screen. Because the app is embedded in a
 * SharePoint page that owns the scroll, resetting `window` alone isn't enough — this finds the real
 * scroll container (the nearest scrollable ancestor of the route outlet) and resets it, and also
 * resets any scrollable region inside the outlet plus the window/document as fallbacks. Runs on every
 * pathname change (covers a reused component instance across a param change). Renders nothing.
 */
export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const reset = (): void => {
      const outlet = document.getElementById(ROUTE_OUTLET_ID) ?? undefined;

      // 1) The host scroll container (SharePoint page) — the one that actually carries the app.
      const scroller = findScrollableAncestor(outlet);
      if (scroller) scroller.scrollTop = 0;

      // 2) Any scrollable region within the outlet (a module that scrolls internally).
      if (outlet) {
        outlet.scrollTop = 0;
        outlet.querySelectorAll('*').forEach((node) => {
          if (node instanceof HTMLElement && node.scrollTop > 0) node.scrollTop = 0;
        });
      }

      // 3) Window / document fallbacks for hosts where the page itself is the scroller.
      try {
        window.scrollTo(0, 0);
        if (document.scrollingElement instanceof HTMLElement) document.scrollingElement.scrollTop = 0;
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      } catch {
        /* window/document unavailable (jsdom) — ignore */
      }
    };

    // Reset synchronously, then again after paint — the new screen's content (and thus the scroll
    // container's height) may only exist after the route's first render commits.
    reset();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(reset) : undefined;
    return () => {
      if (raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return null;
};
