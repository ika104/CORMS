import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FileText, FolderClosed, Globe2, Loader2 } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { useServices } from '../../../services/ServiceProvider';
import { IExistingDocItem, IExistingDocLibrary, IExistingDocSite } from '../../../models/IExistingDocument';
import styles from './ExistingDocumentModal.module.scss';

export interface IExistingDocumentModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  /** Called with a link. Selecting never fetches or copies document bytes. */
  onSelect: (document: { fileName: string; url: string }) => void;
}

type Step = 'sites' | 'libraries' | 'documents';

// Create Correspondence → Existing Document picker. Drills sites → libraries → documents; picking a
// document fetches its bytes and hands them to the caller as the main correspondence document. Which
// sites appear from the configurable RecordsHub RH_RecordsHub registry list; access to each is
// still enforced by SharePoint per user, so an inaccessible site/library just comes back empty.
export const ExistingDocumentModal: React.FC<IExistingDocumentModalProps> = ({
  isOpen,
  onDismiss,
  onSelect,
}) => {
  const { t } = useTranslation();
  const { existingDocumentService } = useServices();

  const [step, setStep] = React.useState<Step>('sites');
  const [sites, setSites] = React.useState<IExistingDocSite[]>([]);
  const [libraries, setLibraries] = React.useState<IExistingDocLibrary[]>([]);
  const [documents, setDocuments] = React.useState<IExistingDocItem[]>([]);
  const [site, setSite] = React.useState<IExistingDocSite | undefined>(undefined);
  const [library, setLibrary] = React.useState<IExistingDocLibrary | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // Load the allowed sites each time the modal opens, and reset the drill-down.
  React.useEffect(() => {
    if (!isOpen) return;
    setStep('sites');
    setSite(undefined);
    setLibrary(undefined);
    setLibraries([]);
    setDocuments([]);
    setError(undefined);
    setLoading(true);
    existingDocumentService
      .getAllowedSites()
      .then((result) => setSites(result))
      .catch(() => setError(t('existingDocument.error.sites')))
      .finally(() => setLoading(false));
  }, [isOpen, existingDocumentService, t]);

  const openSite = (selected: IExistingDocSite): void => {
    setSite(selected);
    setStep('libraries');
    setLoading(true);
    setError(undefined);
    existingDocumentService
      .getLibraries(selected.url)
      .then((result) => setLibraries(result))
      .catch(() => setError(t('existingDocument.error.libraries')))
      .finally(() => setLoading(false));
  };

  const openLibrary = (selected: IExistingDocLibrary): void => {
    if (!site) return;
    setLibrary(selected);
    setStep('documents');
    setLoading(true);
    setError(undefined);
    existingDocumentService
      .getDocuments(site.url, selected.title)
      .then((result) => setDocuments(result))
      .catch(() => setError(t('existingDocument.error.documents')))
      .finally(() => setLoading(false));
  };

  const chooseDocument = (doc: IExistingDocItem): void => {
    if (!site) return;
    onSelect({
      fileName: doc.name,
      url: doc.url || `${site.url.replace(/\/$/, '')}${doc.serverRelativeUrl}`,
    });
    onDismiss();
  };

  const goToSites = (): void => {
    setStep('sites');
    setSite(undefined);
    setLibrary(undefined);
  };
  const goToLibraries = (): void => {
    setStep('libraries');
    setLibrary(undefined);
  };

  const renderBreadcrumb = (): React.ReactNode => (
    <div className={styles.breadcrumb}>
      <button type="button" className={styles.crumb} onClick={goToSites} disabled={step === 'sites'}>
        {t('existingDocument.sites')}
      </button>
      {site && (
        <>
          <ChevronRight size={13} className={styles.crumbSep} />
          <button
            type="button"
            className={styles.crumb}
            onClick={goToLibraries}
            disabled={step === 'libraries'}
          >
            {site.title}
          </button>
        </>
      )}
      {library && (
        <>
          <ChevronRight size={13} className={styles.crumbSep} />
          <span className={styles.crumbCurrent}>{library.title}</span>
        </>
      )}
    </div>
  );

  const renderBody = (): React.ReactNode => {
    if (loading) {
      return (
        <div className={styles.state}>
          <Loader2 size={22} className={styles.spinner} /> {t('common.loading')}
        </div>
      );
    }
    if (error) return <div className={styles.stateError}>{error}</div>;

    if (step === 'sites') {
      if (sites.length === 0) return <div className={styles.state}>{t('existingDocument.empty.sites')}</div>;
      return (
        <ul className={styles.list}>
          {sites.map((s) => (
            <li key={s.url}>
              <button type="button" className={styles.row} onClick={() => openSite(s)}>
                <Globe2 size={16} className={styles.rowIcon} />
                <span className={styles.rowLabel}>{s.title}</span>
                <ChevronRight size={15} className={styles.rowChevron} />
              </button>
            </li>
          ))}
        </ul>
      );
    }

    if (step === 'libraries') {
      if (libraries.length === 0)
        return <div className={styles.state}>{t('existingDocument.empty.libraries')}</div>;
      return (
        <ul className={styles.list}>
          {libraries.map((lib) => (
            <li key={lib.id}>
              <button type="button" className={styles.row} onClick={() => openLibrary(lib)}>
                <FolderClosed size={16} className={styles.rowIcon} />
                <span className={styles.rowLabel}>{lib.title}</span>
                <ChevronRight size={15} className={styles.rowChevron} />
              </button>
            </li>
          ))}
        </ul>
      );
    }

    if (documents.length === 0)
      return <div className={styles.state}>{t('existingDocument.empty.documents')}</div>;
    return (
      <ul className={styles.list}>
        {documents.map((doc) => (
          <li key={doc.serverRelativeUrl}>
            <button type="button" className={styles.row} onClick={() => chooseDocument(doc)} disabled={false}>
              <FileText size={16} className={styles.rowIcon} />
              <span className={styles.rowLabel}>{doc.name}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} title={t('existingDocument.title')} width={560}>
      {renderBreadcrumb()}
      <div className={styles.panel}>{renderBody()}</div>
    </Modal>
  );
};
