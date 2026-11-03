import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EmbeddedFrameModal } from './EmbeddedFrameModal';

export interface IPowerAppsFormModalProps {
  isOpen: boolean;
  /** The Power Apps play URL to embed (already fully built — taskId/requestedBy substituted). */
  url: string;
  title: string;
  onDismiss: () => void;
  /** Invoked when the embedded app explicitly reports a successful save. */
  onSubmitted?: () => void;
}

const FORM_SUBMITTED_MESSAGE = 'corms:form-submitted';

function isFormSubmittedMessage(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === FORM_SUBMITTED_MESSAGE;
}

/**
 * Embeds a Power Apps form in an iframe overlay — used by My Tasks to show the Create Task and
 * Task Details forms in place rather than sending the user off to a new browser tab. The URLs are
 * admin-configured (powerAppsUrls.ts) and use `hidenavbar=true` so the embedded form has no Power
 * Apps chrome. An "Open in new tab" link is always offered as a fallback in case the tenant's
 * Power Apps / SharePoint frame-ancestor policy blocks embedding.
 */
export const PowerAppsFormModal: React.FC<IPowerAppsFormModalProps> = ({
  isOpen,
  url,
  title,
  onDismiss,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Canvas apps cannot expose their internal save state to the host. A configured form can signal
  // success with window.parent.postMessage({ type: 'corms:form-submitted' }, targetOrigin). Only
  // accept a message from this iframe, then leave closing and refresh behavior to the owning view.
  React.useEffect(() => {
    if (!isOpen || !onSubmitted) return undefined;
    const handleMessage = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow || !isFormSubmittedMessage(event.data)) return;
      onSubmitted();
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, onSubmitted]);

  return (
    <EmbeddedFrameModal
      isOpen={isOpen}
      url={url}
      title={title}
      onDismiss={onDismiss}
      openInNewTabLabel={t('powerApps.openInNewTab')}
      loadingLabel={t('powerApps.loading')}
      frameRef={iframeRef}
    />
  );
};
