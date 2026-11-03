import * as React from 'react';
import type { ServiceScope, ISPEventObserver } from '@microsoft/sp-core-library';
import type { IReadonlyTheme, ThemeChangedEventArgs } from '@microsoft/sp-component-base';

// A stable, minimal observer identity for the SPEvent subscription — this hook has no
// SPFx component instance of its own to pass as the observer.
const THEME_OBSERVER: ISPEventObserver = {
  instanceId: 'corms-sp-theme-observer',
  componentId: 'corms-sp-theme-observer',
  isDisposed: false,
  dispose: () => undefined,
};

// Reads the SharePoint site's current "Change the look" theme and stays subscribed for
// live updates, so switching the site theme re-colors the app without a reload.
export function useSharePointTheme(serviceScope: ServiceScope | undefined): IReadonlyTheme | undefined {
  const [spTheme, setSpTheme] = React.useState<IReadonlyTheme | undefined>(undefined);

  React.useEffect(() => {
    if (!serviceScope) return undefined;

    // Required lazily (not as a static import): @microsoft/sp-component-base pulls in
    // @microsoft/sp-core-library's SPFlight module, which only resolves inside a real
    // SPFx runtime. A static import would break the jsdom/Jest test harness, which never
    // supplies a serviceScope and so never needs this module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const spComponentBase = require('@microsoft/sp-component-base') as typeof import('@microsoft/sp-component-base');
    const provider = serviceScope.consume(spComponentBase.ThemeProvider.serviceKey);
    setSpTheme(provider.tryGetTheme());

    const handleThemeChanged = (args: ThemeChangedEventArgs): void => {
      setSpTheme(args.theme);
    };
    provider.themeChangedEvent.add(THEME_OBSERVER, handleThemeChanged);

    return () => {
      provider.themeChangedEvent.remove(THEME_OBSERVER, handleThemeChanged);
    };
  }, [serviceScope]);

  return spTheme;
}
