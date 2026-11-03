import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  MoveHorizontal,
  Table as TableIcon,
  Underline,
} from 'lucide-react';
import styles from './RichTextEditor.module.scss';

export interface IRichTextEditorProps {
  value: string;
  dir: 'ltr' | 'rtl';
  onChange: (html: string) => void;
  onDirChange: (dir: 'ltr' | 'rtl') => void;
  placeholder: string;
  validationField?: string;
  invalid?: boolean;
}

// contentEditable-based editor matching the prototype's toolbar (Bold/Italic/Underline, align,
// lists, LTR/RTL toggle, Table, Image, raw-HTML view). Uses document.execCommand for the
// formatting commands — deprecated but the pragmatic choice for a DEV-scope editor with no rich
// text library in the project; swap for a maintained editor (e.g. Tiptap) if this graduates
// beyond DEV. TODO(confirm) if a dedicated library is wanted before production.
export const RichTextEditor: React.FC<IRichTextEditorProps> = ({
  value,
  dir,
  onChange,
  onDirChange,
  placeholder,
  validationField,
  invalid = false,
}) => {
  const { t } = useTranslation();
  const editableRef = React.useRef<HTMLDivElement>(null);
  const [showHtmlSource, setShowHtmlSource] = React.useState(false);

  React.useEffect(() => {
    const el = editableRef.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const exec = (command: string, arg?: string): void => {
    editableRef.current?.focus();
    document.execCommand(command, false, arg);
    onChange(editableRef.current?.innerHTML ?? '');
  };

  const insertTable = (): void => {
    const html =
      '<table style="border-collapse:collapse;width:100%"><tbody>' +
      '<tr><td style="border:1px solid #ccc;padding:4px">&nbsp;</td><td style="border:1px solid #ccc;padding:4px">&nbsp;</td></tr>' +
      '<tr><td style="border:1px solid #ccc;padding:4px">&nbsp;</td><td style="border:1px solid #ccc;padding:4px">&nbsp;</td></tr>' +
      '</tbody></table>';
    exec('insertHTML', html);
  };

  const insertImage = (): void => {
    const url = window.prompt(t('createCorrespondence.compose.imageUrlPrompt'));
    if (url) {
      exec('insertHTML', `<img src="${url}" style="max-width:100%" />`);
    }
  };

  return (
    <div className={styles.wrap} dir={dir}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('bold')}
          aria-label={t('createCorrespondence.compose.bold')}
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('italic')}
          aria-label={t('createCorrespondence.compose.italic')}
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('underline')}
          aria-label={t('createCorrespondence.compose.underline')}
        >
          <Underline size={14} />
        </button>
        <span className={styles.separator} />
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('justifyLeft')}
          aria-label="Align left"
        >
          <AlignLeft size={14} />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('justifyCenter')}
          aria-label="Align center"
        >
          <AlignCenter size={14} />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('justifyRight')}
          aria-label="Align right"
        >
          <AlignRight size={14} />
        </button>
        <span className={styles.separator} />
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('insertUnorderedList')}
          aria-label="Bulleted list"
        >
          <List size={14} />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => exec('insertOrderedList')}
          aria-label="Numbered list"
        >
          <ListOrdered size={14} />
        </button>
        <span className={styles.separator} />
        <button
          type="button"
          className={`${styles.toolButton} ${dir === 'ltr' ? styles.toolButtonActive : ''}`}
          onClick={() => onDirChange('ltr')}
          aria-label="Left to right"
        >
          LTR
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${dir === 'rtl' ? styles.toolButtonActive : ''}`}
          onClick={() => onDirChange('rtl')}
          aria-label="Right to left"
        >
          RTL
        </button>
        <span className={styles.separator} />
        <button type="button" className={styles.toolButton} onClick={insertTable} aria-label="Insert table">
          <TableIcon size={14} />
        </button>
        <button type="button" className={styles.toolButton} onClick={insertImage} aria-label="Insert image">
          <ImageIcon size={14} />
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${showHtmlSource ? styles.toolButtonActive : ''}`}
          onClick={() => setShowHtmlSource((prev) => !prev)}
          aria-label="HTML source"
        >
          <Code size={14} />
        </button>
        <span className={styles.spacer} />
        <span className={styles.label}>
          <MoveHorizontal size={12} /> {t('createCorrespondence.compose.richTextEditor')}
        </span>
      </div>

      {showHtmlSource ? (
        <textarea
          className={styles.htmlSource}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div
          ref={editableRef}
          className={styles.editable}
          contentEditable
          data-placeholder={placeholder}
          data-validation-field={validationField}
          aria-invalid={invalid || undefined}
          onInput={() => onChange(editableRef.current?.innerHTML ?? '')}
          suppressContentEditableWarning
        />
      )}
    </div>
  );
};
