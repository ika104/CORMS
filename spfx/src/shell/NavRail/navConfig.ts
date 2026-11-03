import navData from '../../mocks/nav.json';
import { INavConfig } from '../../models/INavModel';

// TODO(confirm): group labels ("Workspace" / "System") are placeholders — the real
// section names come from the RecordsHub menu list (D-01/D-08) in TASK-04.
//
// Fallback nav model used only until the RecordsHub-backed fetch (useNav) resolves —
// keeps the rail from flashing empty on first mount. Structured so a future
// RecordsHub-sourced navConfig (D-01/D-08) is a drop-in replacement; components
// never read this directly, they consume useNav().
export const defaultNavConfig: INavConfig = navData as INavConfig;
