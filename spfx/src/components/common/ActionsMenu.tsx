import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import styles from './ActionsMenu.module.scss';

export interface IActionsMenuItem {
  key: string;
  /** i18n key for the item label. */
  labelKey: string;
  iconName: string;
  /** Omit for items whose behaviour is not implemented yet, or not currently available (e.g. an
   * unconfigured deep-link target) — renders as disabled. */
  onClick?: () => void;
  /** Draws a separator above this item. */
  dividerBefore?: boolean;
  /** Native title attribute — e.g. explaining *why* an item with no onClick is disabled. */
  title?: string;
}

export interface IActionsMenuProps {
  items: IActionsMenuItem[];
  /** i18n key for the trigger's accessible name. */
  ariaLabelKey: string;
}

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Row/card overflow menu ("..." trigger).
 *
 * The menu is portaled to document.body and positioned from the trigger's bounding rect,
 * so it renders above neighbouring cards and escapes ancestors that clip overflow — the
 * card grid and AG Grid's virtualised viewport both do.
 */
export const ActionsMenu: React.FC<IActionsMenuProps> = ({ items, ariaLabelKey }) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | undefined>(undefined);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    setPos(undefined);
  }, []);

  // Measured after paint so the menu's real width is known before it is placed; it stays
  // hidden until `pos` is set to avoid a flash at the wrong position.
  React.useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const isRtl = trigger.closest('[dir]')?.getAttribute('dir') === 'rtl';

    const preferredLeft = isRtl ? triggerRect.left : triggerRect.right - menuRect.width;
    const maxLeft = window.innerWidth - menuRect.width - VIEWPORT_MARGIN;

    setPos({
      top: triggerRect.bottom + MENU_GAP,
      left: Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft)),
    });
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={triggerRef} data-actions-menu="true" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(ariaLabelKey)}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
      >
        ···
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={styles.menu}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          >
            {items.map((item) => (
              <React.Fragment key={item.key}>
                {item.dividerBefore && <div className={styles.divider} />}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  disabled={!item.onClick}
                  title={item.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick?.();
                    close();
                  }}
                >
                  <Icon name={item.iconName} size={14} />
                  {t(item.labelKey)}
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
