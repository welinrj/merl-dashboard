// TranslationPanel.jsx — correct the machine's French without touching the record.
//
// The record itself is always edited in the language it was entered in: the
// registered project title is what prints on official reports, and an officer
// working in French must not overwrite it by typing a translation into the name
// box. So the form above keeps editing the source, and this panel — shown only
// when the portal is in a language the record was not written in — edits the
// translation beside it.
//
// A correction is marked `human` in the database and the translation worker
// never overwrites it again. "Retranslate" hands the field back to the machine.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabaseClient';
import { dbErrorMessage } from '../../lib/dbError';
import toast from 'react-hot-toast';
import {
  sourceRow, isTranslatedView, translatableColumns, humaniseColumn,
} from '../../lib/contentLocale';
import { Languages, RotateCcw } from './icons';

/**
 * @param {string}   table   merl table name, as registered in merl.translatable_fields
 * @param {object}   row     the record being edited (localised or not)
 * @param {object}   [labels] column name → the label the form uses for it
 * @param {Function} [onSaved] called after a correction lands, to refresh the list
 */
export default function TranslationPanel({ table, row, labels = {}, onSaved }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const record = sourceRow(row);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(false);

  const translations = record?.i18n?.[lang] ?? {};
  const origins = record?.i18n?._origin?.[lang] ?? {};

  // Reset when a different record is opened, or the language changes.
  useEffect(() => { setDraft({}); }, [record?.id, lang]);

  // Nothing to correct on a record being read in the language it was written in,
  // or one that has not been saved yet.
  if (!isTranslatedView(lang) || !record?.id) return null;

  // Only fields this record actually has text in — an empty box to translate
  // nothing is noise in a form that already has plenty.
  const offered = translatableColumns(table)
    .filter((name) => typeof record[name] === 'string' && record[name].trim() !== '')
    .map((name) => ({ name, label: labels[name] ?? humaniseColumn(name) }));
  if (offered.length === 0) return null;

  const valueFor = (name) => draft[name] ?? translations[name] ?? '';

  const save = async (field) => {
    const text = valueFor(field.name).trim();
    if (!text) return;
    setBusy(field.name);
    const { error } = await supabase.rpc('save_content_translation', {
      p_table: table, p_row_id: record.id, p_column: field.name,
      p_lang: lang, p_text: text,
    });
    setBusy(null);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(t('tr.saved'));
    setDraft((d) => ({ ...d, [field.name]: undefined }));
    onSaved?.();
  };

  const reset = async (field) => {
    setBusy(field.name);
    const { error } = await supabase.rpc('reset_content_translation', {
      p_table: table, p_row_id: record.id, p_column: field.name, p_lang: lang,
    });
    setBusy(null);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(t('tr.reset'));
    setDraft((d) => ({ ...d, [field.name]: undefined }));
    onSaved?.();
  };

  return (
    <div className="tr-panel">
      <button type="button" className="tr-panel-head" onClick={() => setOpen((o) => !o)}
        aria-expanded={open}>
        <Languages size={15} aria-hidden="true" />
        <span>{t('tr.heading', { language: t(`tr.lang_${lang}`, { defaultValue: lang.toUpperCase() }) })}</span>
        <span className="tr-panel-count">{offered.length}</span>
        <span aria-hidden="true" className="tr-panel-chev">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="tr-panel-body">
          <p className="tr-panel-note">{t('tr.explainer')}</p>
          {offered.map((field) => {
            const corrected = origins[field.name] === 'human';
            const hasTranslation = typeof translations[field.name] === 'string';
            return (
              <div key={field.name} className="tr-field">
                <div className="tr-field-head">
                  <span className="field-label">{field.label}</span>
                  {hasTranslation && (
                    <span className={`tr-badge${corrected ? ' corrected' : ''}`}>
                      {corrected ? t('tr.byOfficer') : t('tr.byMachine')}
                    </span>
                  )}
                </div>
                <p className="tr-source" lang="en">{record[field.name]}</p>
                <textarea
                  className="field-input" rows={2} lang={lang}
                  value={valueFor(field.name)}
                  placeholder={t('tr.placeholder')}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.name]: e.target.value }))}
                />
                <div className="tr-field-actions">
                  <button type="button" className="tr-save"
                    disabled={busy === field.name || !valueFor(field.name).trim()}
                    onClick={() => save(field)}>
                    {busy === field.name ? t('tr.saving') : t('tr.save')}
                  </button>
                  {corrected && (
                    <button type="button" className="tr-reset"
                      disabled={busy === field.name} onClick={() => reset(field)}
                      title={t('tr.resetHint')}>
                      <RotateCcw size={13} aria-hidden="true" /> {t('tr.retranslate')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
