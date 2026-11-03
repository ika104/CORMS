/**
 * Provisions CORMS_DevSettings — the key/value list backing TASK-03's Admin Config
 * Data Sources panel (mock/live toggle state, shared across the team on this site).
 *
 * Run after pasting sp-provision.js. Safe to re-run: every step is idempotent.
 */
(async function () {
  'use strict';

  if (!window.CORMSProvision) {
    console.error('[CORMS_DevSettings] CORMSProvision helper not loaded — paste sp-provision.js first.');
    return;
  }

  var P = window.CORMSProvision;
  var LIST_TITLE = 'CORMS_DevSettings';

  P.resetTally();

  await P.ensureList({
    title: LIST_TITLE,
    description: 'CORMS DEV/UAT data-source toggle settings (TASK-03). Key/value rows.',
    template: 100,
  });

  await P.ensureTextField(LIST_TITLE, 'Value', { required: false });
  await P.ensureTextField(LIST_TITLE, 'SettingDescription', { note: true, required: false });
  await P.ensureChoiceField(LIST_TITLE, 'Category', ['DataSource', 'Global'], { required: false });

  P.printTally();
})();
