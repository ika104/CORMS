import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import { Button } from '../../../components/common/Button';
import { FollowUpType, IReminder } from '../../../models/ICorrespondenceDetail';
import styles from './ReminderTab.module.scss';

export interface IReminderTabProps {
  reminder?: IReminder;
  onSave: (reminder: IReminder) => void;
  onClear: () => void;
}

const FOLLOW_UP_TYPES: FollowUpType[] = ['1st Follow-up', '2nd Follow-up Letter', '3rd Follow-up Letter (Final)', 'Escalation Notice'];

// Local state only — actual email-on-reminder-date and escalation notification are backend /
// Power Automate concerns.
// TODO(backend): fire on reminder date via Power Automate; escalation notices also notify supervisor.
export const ReminderTab: React.FC<IReminderTabProps> = ({ reminder, onSave, onClear }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(!reminder);
  const [date, setDate] = React.useState(reminder?.date ?? '');
  const [followUpType, setFollowUpType] = React.useState<FollowUpType>(reminder?.followUpType ?? '1st Follow-up');
  const [note, setNote] = React.useState(reminder?.note ?? '');
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (reminder) {
      setDate(reminder.date);
      setFollowUpType(reminder.followUpType);
      setNote(reminder.note);
    }
  }, [reminder]);

  const handleSave = (): void => {
    if (!date) {
      setError(true);
      return;
    }
    setError(false);
    onSave({ date, followUpType, note });
    setEditing(false);
  };

  if (reminder && !editing) {
    return (
      <div className={styles.tab}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Icon name="bell" size={18} />
            <div>
              <div className={styles.cardType}>{t(`correspondenceDetail.reminder.type.${followUpTypeKey(reminder.followUpType)}`)}</div>
              <div className={styles.cardDate}>{t('correspondenceDetail.reminder.due', { date: reminder.date })}</div>
            </div>
          </div>
          {reminder.note && <div className={styles.cardNote}>{reminder.note}</div>}
          <div className={styles.cardActions}>
            <Button variant="default" onClick={() => setEditing(true)} text={t('correspondenceDetail.reminder.edit')} />
            <Button variant="danger" onClick={onClear} text={t('correspondenceDetail.reminder.clear')} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tab}>
      <div className={styles.notice}>
        <Icon name="info" size={14} /> {t('correspondenceDetail.reminder.notice')}
      </div>
      <div className={styles.field}>
        <label className={styles.label}>{t('correspondenceDetail.reminder.followUpType')}</label>
        <select className={styles.select} value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}>
          {FOLLOW_UP_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(`correspondenceDetail.reminder.type.${followUpTypeKey(ft)}`)}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>{t('correspondenceDetail.reminder.date')}</label>
        <input type="date" className={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
        {error && <div className={styles.error}>{t('common.requiredField')}</div>}
      </div>
      <div className={styles.field}>
        <label className={styles.label}>{t('correspondenceDetail.reminder.note')}</label>
        <textarea
          className={styles.textarea}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('correspondenceDetail.reminder.notePlaceholder')}
        />
      </div>
      <div className={styles.actionsRow}>
        <Button variant="primary" onClick={handleSave} text={t('correspondenceDetail.reminder.save')} />
        {reminder && <Button variant="default" onClick={() => setEditing(false)} text={t('common.cancel')} />}
      </div>
    </div>
  );
};

function followUpTypeKey(type: FollowUpType): string {
  switch (type) {
    case '1st Follow-up':
      return 'first';
    case '2nd Follow-up Letter':
      return 'second';
    case '3rd Follow-up Letter (Final)':
      return 'third';
    case 'Escalation Notice':
      return 'escalation';
    default:
      return 'first';
  }
}
