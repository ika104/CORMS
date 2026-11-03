import * as React from 'react';
import styles from './PickerPopover.module.scss';

export interface IPickerPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The control that opens the popover; the popover is placed against it. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Height to plan for when choosing a side, for popovers whose results load after opening. */
  reserveHeight?: number;
  className?: string;
  popoverClassName?: string;
}

const GAP = 4;

/**
 * A dropdown anchored to its trigger. It opens below the trigger, or above it when the viewport
 * has more room there, and scrolls itself fully into view, so a picker opened near the bottom of
 * the form never hides its options below the fold.
 */
export const PickerPopover: React.FC<IPickerPopoverProps> = ({
  open,
  onClose,
  trigger,
  children,
  reserveHeight = 0,
  className,
  popoverClassName,
}) => {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [placeAbove, setPlaceAbove] = React.useState(false);

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!open || !anchor || !popover) return;
    const rect = anchor.getBoundingClientRect();
    const needed = Math.max(popover.offsetHeight, reserveHeight) + GAP;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setPlaceAbove(spaceBelow < needed && spaceAbove > spaceBelow);
  }, [open, reserveHeight]);

  React.useEffect(() => {
    if (open) popoverRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, placeAbove]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={anchorRef} className={`${styles.anchor} ${className ?? ''}`}>
      {trigger}
      {open && (
        <div
          ref={popoverRef}
          className={`${styles.popover} ${placeAbove ? styles.popoverAbove : ''} ${popoverClassName ?? ''}`}
        >
          {children}
        </div>
      )}
    </div>
  );
};
