import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EmbeddedFrameModal } from '../../../components/common/EmbeddedFrameModal';
import styles from '../../../components/common/EmbeddedFrameModal.module.scss';
import { parseSigningReturn, SigningPageResult } from '../../../services/esignature/signingReturn';

/** How the signing window ended: a result the provider reported, or the user closing it. */
export type SigningFrameOutcome = SigningPageResult | 'dismissed';

export interface ISigningFrameModalProps {
  /** The provider's signing page; the window is open while this is set. */
  url?: string;
  /** The return address sent with the signing request (see signingReturn.ts). */
  returnUrl: string;
  onClose: (outcome: SigningFrameOutcome) => void;
}

/**
 * Shows the provider's signing page inside CORMS. Once the provider sends the frame back to the
 * return address the page is same-origin and readable, so the window closes itself with the result.
 */
export const SigningFrameModal: React.FC<ISigningFrameModalProps> = ({ url, returnUrl, onClose }) => {
  const { t } = useTranslation();

  const handleFrameLoad = (event: React.SyntheticEvent<HTMLIFrameElement>): void => {
    let href: string;
    try {
      // Reading a cross-origin location throws; that simply means the signer is still on the page.
      href = event.currentTarget.contentWindow?.location.href ?? '';
    } catch {
      return;
    }
    const result = parseSigningReturn(href, returnUrl);
    if (result) onClose(result);
  };

  return (
    <EmbeddedFrameModal
      isOpen={!!url}
      url={url ?? ''}
      title={t('correspondenceDetail.eSignature.frameTitle')}
      onDismiss={() => onClose('dismissed')}
      openInNewTabLabel={t('correspondenceDetail.eSignature.openInNewTab')}
      loadingLabel={t('correspondenceDetail.eSignature.frameLoading')}
      onFrameLoad={handleFrameLoad}
      headerActions={
        <button type="button" className={styles.headerButton} onClick={() => onClose('dismissed')}>
          {t('correspondenceDetail.eSignature.done')}
        </button>
      }
    />
  );
};
