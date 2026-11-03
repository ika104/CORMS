import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppShell, useNav, useLocale, useFolders } from '../../state/hooks';
import { defaultNavConfig } from './navConfig';
import { mergeFoldersIntoNav } from './mergeFolders';
import { NavGroup } from './NavGroup';
import { getInitials } from '../../utils/getInitials';
import { CORMS_ROLE_TRANSLATION_KEY } from '../../models/ICormsRole';
import styles from './NavRail.module.scss';

export const NavRail: React.FC = () => {
  const { t } = useTranslation();
  const { railPinned, isRailExpanded, togglePin, setRailHoverExpanded } = useAppShell();
  const { navConfig, currentUser, currentRole } = useNav();
  const { language, setLanguage } = useLocale();
  const { folders } = useFolders();
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const targetLanguage = language === 'en' ? 'ar' : 'en';

  const groups = mergeFoldersIntoNav((navConfig ?? defaultNavConfig).groups, folders);
  const userRoles = currentUser?.roles ?? [];

  return (
    <nav
      className={`${styles.rail} ${isRailExpanded ? styles.expanded : ''}`}
      onMouseEnter={() => !railPinned && setRailHoverExpanded(true)}
      onMouseLeave={() => !railPinned && setRailHoverExpanded(false)}
      onFocus={() => !railPinned && setRailHoverExpanded(true)}
      onBlur={() => !railPinned && setRailHoverExpanded(false)}
      aria-label={t('app.title')}
    >
      {/* Header row */}
      <div className={styles.header}>
        {isRailExpanded && (
          <span className={styles.headerLabel}>{t('rail.navigation')}</span>
        )}
        <div className={styles.headerControls}>
          {isRailExpanded && (
            <button
              type="button"
              className={`${styles.controlBtn} ${railPinned ? styles.controlBtnActive : ''}`}
              onClick={togglePin}
              title={railPinned ? t('rail.unpin') : t('rail.pin')}
              aria-label={railPinned ? t('rail.unpin') : t('rail.pin')}
              aria-pressed={railPinned}
            >
              {railPinned ? '📌' : '📍'}
            </button>
          )}
          <button
            type="button"
            className={styles.controlBtn}
            onClick={togglePin}
            title={isRailExpanded ? t('rail.collapse') : t('rail.expand')}
            aria-label={isRailExpanded ? t('rail.collapse') : t('rail.expand')}
          >
            {isRailExpanded ? '◀' : '▶'}
          </button>
        </div>
      </div>

      {/* Nav items */}
      <div className={styles.groups}>
        {groups.map((group) => (
          <NavGroup key={group.id} group={group} isExpanded={isRailExpanded} userRoles={userRoles} />
        ))}
      </div>

      {/* User footer */}
      {currentUser && isRailExpanded && (
        <div className={styles.userFooter}>
          {currentUser.photoUrl && !photoFailed ? (
            <img
              className={styles.avatarPhoto}
              src={currentUser.photoUrl}
              alt=""
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <div className={styles.avatar}>{getInitials(currentUser.displayName)}</div>
          )}
          <div className={styles.userInfo}>
            <span className={styles.name}>{currentUser.displayName}</span>
            {/* CMS-038 AC8 — the CORMS_UserRoles-backed role (Epic 1 Part 1) takes precedence
                over the older jobTitle/jobTitleKey display; falls back to job title only while
                the role is still resolving, so the footer never renders visibly empty. */}
            {currentRole ? (
              <span className={styles.role}>{t(CORMS_ROLE_TRANSLATION_KEY[currentRole])}</span>
            ) : (
              (currentUser.jobTitle || currentUser.jobTitleKey) && (
                <span className={styles.role}>
                  {currentUser.jobTitle || (currentUser.jobTitleKey && t(currentUser.jobTitleKey))}
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* Utility controls */}
      {isRailExpanded && (
        <div className={styles.utilityControls}>
          <button
            type="button"
            className={styles.langBtn}
            onClick={() => setLanguage(targetLanguage)}
            aria-label={t('language.toggle')}
            title={t('language.toggle')}
          >
            <span aria-hidden="true">🌐</span>
            <span>{t(`language.${targetLanguage}`)}</span>
          </button>
        </div>
      )}
    </nav>
  );
};
