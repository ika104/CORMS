import * as React from 'react';
import { Upload } from 'lucide-react';
import styles from './Dropzone.module.scss';

export interface IDropzoneProps {
  title: string;
  helperText: string;
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

// Shared local-file dropzone (click-to-browse + drag & drop, no upload) — mirrors the
// visual language of the inline dropzone in createCorrespondence's SupportingDocumentsSection,
// extracted here since that screen had no importable shared component to reuse.
export const Dropzone: React.FC<IDropzoneProps> = ({ title, helperText, onFilesSelected, accept, multiple = true }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      className={dragOver ? `${styles.dropzone} ${styles.dropzoneActive}` : styles.dropzone}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) onFilesSelected(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files?.length) onFilesSelected(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <Upload size={28} />
      <span className={styles.title}>{title}</span>
      <span className={styles.helper}>{helperText}</span>
    </div>
  );
};
