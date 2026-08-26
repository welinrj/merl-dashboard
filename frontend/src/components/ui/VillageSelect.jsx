// VillageSelect.jsx — choose the village, or add the one that isn't listed.
//
// Community / Site used to be an empty text box, so the same village arrived
// spelled three ways and carried no coordinates. This offers the gazetteer
// (merl.ref_villages, migration 0037) filtered by the province and island
// already chosen on the form, and falls back to naming a new village and
// dropping a pin — which adds it to the gazetteer so the next officer finds it.
//
// It stays a text input rather than a <select>: the officer may be typing a
// village that is genuinely new, and a national gazetteer is far too long to
// scroll. Typing filters; picking fills in the island, area council and
// coordinates the gazetteer knows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus } from './icons';

const fold = (s) => String(s ?? '').trim().toLowerCase();
const MAX_SUGGESTIONS = 8;

/**
 * @param {string}   value        the community name currently on the form
 * @param {string|null} villageId the gazetteer row it came from, if any
 * @param {Array}    villages     the whole gazetteer (filtered here, not fetched per keystroke)
 * @param {string}   [province]   narrows the list; the form's province
 * @param {string}   [island]     narrows it further
 * @param {Function} onSelect     ({ name, villageId, island, areaCouncil, latitude, longitude })
 * @param {boolean}  [canAdd]     false where the register does not exist yet, so
 *                                the officer is not offered a save that cannot work
 * @param {Function} onAddRequest called when the officer says their village isn't listed
 */
export default function VillageSelect({
  value, villageId, villages = [], province, island, canAdd = true, onSelect, onAddRequest,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? '');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => { setQuery(value ?? ''); }, [value]);

  // Close when focus leaves the whole control, not merely the input — clicking
  // a suggestion blurs the input first.
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = fold(query);
    const inScope = villages.filter((v) => {
      // A village with no province recorded could be anywhere, so it stays in
      // the list rather than being hidden by a filter it never opted into.
      if (province && v.province_code && v.province_code !== province) return false;
      if (island && v.island && fold(v.island) !== fold(island)) return false;
      return true;
    });
    if (!q) return inScope.slice(0, MAX_SUGGESTIONS);
    const starts = [], contains = [];
    for (const v of inScope) {
      const n = fold(v.name);
      if (n.startsWith(q)) starts.push(v);
      else if (n.includes(q)) contains.push(v);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [villages, query, province, island]);

  // An exact name match means the officer has effectively already chosen it.
  const exact = useMemo(
    () => matches.find((v) => fold(v.name) === fold(query)),
    [matches, query],
  );

  const choose = (v) => {
    setQuery(v.name);
    setOpen(false);
    onSelect({
      name: v.name,
      villageId: v.id,
      island: v.island ?? null,
      areaCouncil: v.area_council ?? null,
      latitude: v.latitude != null ? Number(v.latitude) : null,
      longitude: v.longitude != null ? Number(v.longitude) : null,
    });
  };

  const typeFreely = (text) => {
    setQuery(text);
    setActive(0);
    setOpen(true);
    // Typing over a chosen village detaches it: the name no longer refers to
    // that gazetteer row, and silently keeping the link would attach the wrong
    // coordinates to a different place.
    onSelect({ name: text, villageId: null });
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const listId = 'village-suggestions';

  return (
    <div className="vs-wrap" ref={boxRef}>
      <div className="vs-inputrow">
        <input
          className="field-input"
          value={query}
          onChange={(e) => typeFreely(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('ps.villagePlaceholder')}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {villageId && <span className="vs-chip" title={t('ps.villageLinked')}><MapPin size={12} aria-hidden="true" /></span>}
      </div>

      {open && (
        <div className="vs-menu" id={listId} role="listbox">
          {matches.length > 0 ? matches.map((v, i) => (
            <button type="button" key={v.id} role="option" aria-selected={i === active}
              className={`vs-opt${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(v)}>
              <span className="vs-opt-name">{v.name}</span>
              <span className="vs-opt-where">
                {[v.island, v.province_code].filter(Boolean).join(' · ') || t('ps.villageNoPlace')}
              </span>
              {v.source === 'officer' && <span className="vs-opt-tag">{t('ps.villageAddedByStaff')}</span>}
            </button>
          )) : (
            <p className="vs-empty">
              {!canAdd ? t('ps.villageRegisterUnavailable')
                : villages.length === 0 ? t('ps.villageGazetteerEmpty')
                : t('ps.villageNoMatch')}
            </p>
          )}

          {canAdd && !exact && query.trim() !== '' && (
            <button type="button" className="vs-add" onClick={() => { setOpen(false); onAddRequest(query.trim()); }}>
              <Plus size={13} aria-hidden="true" /> {t('ps.villageAddThis', { name: query.trim() })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
