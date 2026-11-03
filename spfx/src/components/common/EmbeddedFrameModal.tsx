import * as React from 'react';
import { Modal as FluentModal } from '@fluentui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import { Spinner } from './Spinner';
import styles from './EmbeddedFrameModal.module.scss';

export interface IEmbeddedFrameModalProps {
  isOpen: boolean;
  /** The external page to show in place. */
  url: string;
  title: string;
  onDismiss: () => void;
  /** Label of the always-available fallback link, for tenants whose policy blocks the frame. */
  openInNewTabLabel: string;
  loadingLabel: string;
  /** Extra header controls rendered before the new-tab link and the close button. */
  headerActions?: React.ReactNode;
  frameRef?: React.Ref<HTMLIFrameElement>;
  /** Called on every navigation inside the frame, after it has loaded. */
  onFrameLoad?: (event: React.SyntheticEvent<HTMLIFrameElement>) => void;
}

/**
 * A near-full-screen overlay that shows an external page in an iframe, so the user completes it
 * inside CORMS instead of in another browser tab.
 */
export const EmbeddedFrameModal: React.FC<IEmbeddedFrameModalProps> = ({
  isOpen,
  url,
  title,
  onDismiss,
  openInNewTabLabel,
  loadingLabel,
  headerActions,
  frameRef,
  onFrameLoad,
}) => {
  const { t } = useTranslation();
  const [loaded, setLoaded] = React.useState(false);

  // Reset the loading state whenever a different page is opened.
  React.useEffect(() => {
    if (isOpen) setLoaded(false);
  }, [isOpen, url]);

  return (
    <FluentModal
      isOpen={isOpen}
      onDismiss={onDismiss}
      isBlocking={false}
      containerClassName={styles.container}
      styles={{
        main: { width: '96vw', maxWidth: 1400, height: '94vh' },
        // Fluent wraps children in a scrollableContent layer that otherwise sizes to content — make
        // it a full-height flex column so the iframe body can actually fill the modal's height.
        scrollableContent: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.headerActions}>
          {headerActions}
          {url && (
            <a className={styles.openExternal} href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="externalLink" size={14} /> {openInNewTabLabel}
            </a>
          )}
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onDismiss}
            aria-label={t('common.close')}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
      <div className={styles.body}>
        {!loaded && (
          <div className={styles.loading}>
            <Spinner label={loadingLabel} />
          </div>
        )}
        {url && (
          <iframe
            ref={frameRef}
            title={title}
            className={styles.iframe}
            src={url}
            onLoad={(event) => {
              setLoaded(true);
              onFrameLoad?.(event);
            }}
            allow="camera; microphone; geolocation; clipboard-write"
          />
        )}
      </div>
    </FluentModal>
  );
};
