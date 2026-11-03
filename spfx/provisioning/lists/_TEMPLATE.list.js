/**
 * Copy-me template for a new CORMS-owned list. Rename the file to CORMS_<Feature>.js,
 * fill in the list title/description/fields, and drop it in provisioning/lists/.
 *
 * Run after pasting sp-provision.js. Safe to re-run: every step is idempotent.
 */
(async function () {
  'use strict';

  if (!window.CORMSProvision) {
    console.error('[CORMS_TEMPLATE] CORMSProvision helper not loaded — paste sp-provision.js first.');
    return;
  }

  var P = window.CORMSProvision;
  var LIST_TITLE = 'CORMS_TODO_RenameMe';

  P.resetTally();

  await P.ensureList({
    title: LIST_TITLE,
    description: 'TODO: describe this list and which feature/task it backs.',
    template: 100, // 100 = generic list, 101 = document library
  });

  // Field examples — remove the ones you don't need, add more as needed:
  await P.ensureTextField(LIST_TITLE, 'ExampleText', { required: false });
  await P.ensureTextField(LIST_TITLE, 'ExampleNote', { note: true, required: false });
  await P.ensureNumberField(LIST_TITLE, 'ExampleNumber', { required: false });
  await P.ensureDateField(LIST_TITLE, 'ExampleDate', { required: false });
  await P.ensureChoiceField(LIST_TITLE, 'ExampleChoice', ['OptionA', 'OptionB'], { required: false });

  // Escape hatch for anything the ensure* helpers don't cover (lookups, etc.) — hand-write CAML:
  // await P.ensureFieldXml(LIST_TITLE, '<Field Type="Lookup" Name="ExampleLookup" ... />');

  P.printTally();
})();
