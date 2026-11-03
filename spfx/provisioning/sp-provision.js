/**
 * CORMSProvision — shared helper for provisioning CORMS-owned SharePoint lists via the
 * SharePoint REST API, pasted into the browser console (F12) on the target site.
 *
 * Paste this file first, then paste a list script (e.g. lists/CORMS_DevSettings.js).
 *
 * Every `ensure*` call is idempotent: it checks for existence first and only creates/adds
 * when something is actually missing. Re-running any script must make no destructive change.
 *
 * Not a module — this is pasted directly into devtools, so it defines a single global,
 * window.CORMSProvision, and nothing else.
 */
(function () {
  'use strict';

  var state = {
    siteUrl: (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) || window.location.origin,
    digest: null,
    digestSite: null,
    tally: { created: 0, existed: 0, errors: 0 },
  };

  function log(step, status, detail) {
    var prefix = '[CORMSProvision]';
    var line = prefix + ' ' + step + ' — ' + status + (detail ? ' (' + detail + ')' : '');
    if (status === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
    if (status === 'created') state.tally.created++;
    else if (status === 'exists') state.tally.existed++;
    else if (status === 'error') state.tally.errors++;
  }

  function resetTally() {
    state.tally = { created: 0, existed: 0, errors: 0 };
  }

  function printTally() {
    console.log(
      '[CORMSProvision] Done — created ' +
        state.tally.created +
        ', existed ' +
        state.tally.existed +
        ', errors ' +
        state.tally.errors
    );
    return { ...state.tally };
  }

  function setSite(url) {
    state.siteUrl = url.replace(/\/$/, '');
    state.digest = null;
    state.digestSite = null;
    console.log('[CORMSProvision] Target site set to ' + state.siteUrl);
  }

  async function getDigest() {
    if (state.digest && state.digestSite === state.siteUrl) {
      return state.digest;
    }
    var response = await fetch(state.siteUrl + '/_api/contextinfo', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json;odata=verbose' },
    });
    if (!response.ok) {
      throw new Error('getDigest failed: ' + response.status + ' ' + response.statusText);
    }
    var body = await response.json();
    state.digest = body.d.GetContextWebInformation.FormDigestValue;
    state.digestSite = state.siteUrl;
    return state.digest;
  }

  function jsonHeaders(digest) {
    var headers = {
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
    };
    if (digest) headers['X-RequestDigest'] = digest;
    return headers;
  }

  async function getListByTitle(title) {
    var response = await fetch(
      state.siteUrl + "/_api/web/lists/getbytitle('" + encodeURIComponent(title) + "')",
      { credentials: 'include', headers: { Accept: 'application/json;odata=verbose' } }
    );
    return response;
  }

  async function listExists(title) {
    var response = await getListByTitle(title);
    return response.status !== 404;
  }

  async function ensureList(opts) {
    var title = opts.title;
    var description = opts.description || '';
    var template = opts.template || 100;

    var exists = await listExists(title);
    if (exists) {
      log('ensureList(' + title + ')', 'exists');
      return { status: 'exists' };
    }

    var digest = await getDigest();
    var body = {
      __metadata: { type: 'SP.List' },
      Title: title,
      Description: description,
      BaseTemplate: template,
    };
    var response = await fetch(state.siteUrl + '/_api/web/lists', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders(digest),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      var errText = await response.text();
      log('ensureList(' + title + ')', 'error', response.status + ' ' + errText.slice(0, 200));
      return { status: 'error' };
    }
    log('ensureList(' + title + ')', 'created');
    return { status: 'created' };
  }

  async function getFieldByTitle(listTitle, fieldName) {
    var response = await fetch(
      state.siteUrl +
        "/_api/web/lists/getbytitle('" +
        encodeURIComponent(listTitle) +
        "')/fields/getbytitle('" +
        encodeURIComponent(fieldName) +
        "')",
      { credentials: 'include', headers: { Accept: 'application/json;odata=verbose' } }
    );
    return response;
  }

  async function fieldExists(listTitle, fieldName) {
    var response = await getFieldByTitle(listTitle, fieldName);
    return response.status !== 404;
  }

  async function ensureFieldXml(listTitle, camlFieldXml) {
    // Field name is only used for the existence check / logging — extract it from the CAML.
    var nameMatch = /StaticName="([^"]+)"/.exec(camlFieldXml) || /Name="([^"]+)"/.exec(camlFieldXml);
    var fieldName = nameMatch ? nameMatch[1] : '(unknown field)';

    var exists = await fieldExists(listTitle, fieldName);
    if (exists) {
      log('ensureField(' + listTitle + '.' + fieldName + ')', 'exists');
      return { status: 'exists' };
    }

    var digest = await getDigest();
    var response = await fetch(
      state.siteUrl + "/_api/web/lists/getbytitle('" + encodeURIComponent(listTitle) + "')/fields",
      {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders(digest),
        body: JSON.stringify({
          parameters: {
            __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
            SchemaXml: camlFieldXml,
          },
        }),
      }
    );
    if (!response.ok) {
      var errText = await response.text();
      log('ensureField(' + listTitle + '.' + fieldName + ')', 'error', response.status + ' ' + errText.slice(0, 200));
      return { status: 'error' };
    }
    log('ensureField(' + listTitle + '.' + fieldName + ')', 'created');
    return { status: 'created' };
  }

  function escapeXmlAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  async function ensureTextField(listTitle, name, opts) {
    opts = opts || {};
    var type = opts.note ? 'Note' : 'Text';
    var required = opts.required ? 'TRUE' : 'FALSE';
    var xml =
      '<Field Type="' +
      type +
      '" Name="' +
      escapeXmlAttr(name) +
      '" StaticName="' +
      escapeXmlAttr(name) +
      '" DisplayName="' +
      escapeXmlAttr(name) +
      '" Required="' +
      required +
      '" />';
    return ensureFieldXml(listTitle, xml);
  }

  async function ensureNumberField(listTitle, name, opts) {
    opts = opts || {};
    var required = opts.required ? 'TRUE' : 'FALSE';
    var xml =
      '<Field Type="Number" Name="' +
      escapeXmlAttr(name) +
      '" StaticName="' +
      escapeXmlAttr(name) +
      '" DisplayName="' +
      escapeXmlAttr(name) +
      '" Required="' +
      required +
      '" />';
    return ensureFieldXml(listTitle, xml);
  }

  async function ensureDateField(listTitle, name, opts) {
    opts = opts || {};
    var required = opts.required ? 'TRUE' : 'FALSE';
    var xml =
      '<Field Type="DateTime" Name="' +
      escapeXmlAttr(name) +
      '" StaticName="' +
      escapeXmlAttr(name) +
      '" DisplayName="' +
      escapeXmlAttr(name) +
      '" Required="' +
      required +
      '" Format="DateOnly" />';
    return ensureFieldXml(listTitle, xml);
  }

  async function ensureChoiceField(listTitle, name, choices, opts) {
    opts = opts || {};
    var required = opts.required ? 'TRUE' : 'FALSE';
    var choicesXml = choices.map((c) => '<CHOICE>' + escapeXmlAttr(c) + '</CHOICE>').join('');
    var xml =
      '<Field Type="Choice" Name="' +
      escapeXmlAttr(name) +
      '" StaticName="' +
      escapeXmlAttr(name) +
      '" DisplayName="' +
      escapeXmlAttr(name) +
      '" Required="' +
      required +
      '" Format="Dropdown">' +
      '<CHOICES>' +
      choicesXml +
      '</CHOICES></Field>';
    return ensureFieldXml(listTitle, xml);
  }

  window.CORMSProvision = {
    setSite,
    getDigest,
    listExists,
    ensureList,
    fieldExists,
    ensureTextField,
    ensureNumberField,
    ensureDateField,
    ensureChoiceField,
    ensureFieldXml,
    log,
    resetTally,
    printTally,
  };

  console.log(
    '[CORMSProvision] Helper loaded. Target site: ' +
      state.siteUrl +
      ' — call CORMSProvision.setSite(url) to change it.'
  );
})();
