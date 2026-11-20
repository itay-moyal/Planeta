import { useEffect, useState } from 'react';
import { api } from '../api.js';

export const WINDOWS = [['N', 'צפון'], ['E', 'מזרח'], ['S', 'דרום'], ['W', 'מערב']];
export const LIGHTS = [['low', 'נמוכה'], ['medium', 'בינונית'], ['high', 'גבוהה']];
export const SUNS = [['full', 'שמש מלאה'], ['partial', 'שמש חלקית'], ['shade', 'צל']];

function Select({ value, onChange, options, label }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">לא ידוע</option>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

// Collects name + placement (+ planter for the balcony) and hands them to onSubmit.
// Used when saving a new plant (D3) and, later, when editing one (D4).
export default function PlacementForm({ initial = {}, submitLabel, onSubmit }) {
  const p = initial.placement ?? {};
  const [name, setName] = useState(initial.name ?? '');
  const [location, setLocation] = useState(p.location ?? 'indoor');
  const [windowDirection, setWindowDirection] = useState(p.windowDirection ?? '');
  const [lightLevel, setLightLevel] = useState(p.lightLevel ?? '');
  const [sunExposure, setSunExposure] = useState(p.sunExposure ?? '');
  const [potSizeNotes, setPotSizeNotes] = useState(p.potSizeNotes ?? '');
  const [planters, setPlanters] = useState([]);
  const [planterChoice, setPlanterChoice] = useState(initial.planterId ?? 'none'); // 'none' | 'new' | planter id
  const [newPlanter, setNewPlanter] = useState({ name: '', sunExposure: '', sizeNotes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/planters').then((data) => setPlanters(data.planters)).catch(() => {}); // the form works without them
  }, []);

  function buildPlacement() {
    if (location === 'indoor') {
      return { location, ...(windowDirection && { windowDirection }), ...(lightLevel && { lightLevel }) };
    }
    return { location, ...(sunExposure && { sunExposure }), ...(potSizeNotes.trim() && { potSizeNotes }) };
  }

  async function onFormSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      let planterId = null;
      if (location === 'balcony' && planterChoice === 'new') {
        const body = { name: newPlanter.name };
        if (newPlanter.sunExposure) body.sunExposure = newPlanter.sunExposure;
        if (newPlanter.sizeNotes.trim()) body.sizeNotes = newPlanter.sizeNotes;
        const data = await api('/api/planters', { method: 'POST', json: body });
        // Select it right away: if saving the plant fails, a retry must not create a duplicate planter.
        setPlanters((list) => [...list, data.planter]);
        setPlanterChoice(data.planter.id);
        planterId = data.planter.id;
      } else if (location === 'balcony' && planterChoice !== 'none') {
        planterId = planterChoice;
      }
      await onSubmit({ name, placement: buildPlacement(), planterId });
    } catch (err) {
      setError(err.message); // already Hebrew
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onFormSubmit}>
      <label>
        שם הצמח
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </label>

      <label>
        איפה הצמח?
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="indoor">בתוך הבית</option>
          <option value="balcony">מרפסת / עציץ חיצוני</option>
        </select>
      </label>

      {location === 'indoor' ? (
        <>
          <Select label="כיוון החלון" value={windowDirection} onChange={setWindowDirection} options={WINDOWS} />
          <Select label="רמת אור" value={lightLevel} onChange={setLightLevel} options={LIGHTS} />
        </>
      ) : (
        <>
          <Select label="חשיפה לשמש" value={sunExposure} onChange={setSunExposure} options={SUNS} />
          <label>
            גודל העציץ (אופציונלי)
            <input value={potSizeNotes} onChange={(e) => setPotSizeNotes(e.target.value)} maxLength={200} />
          </label>
          <label>
            גדלים ביחד באותה תיבה?
            <select value={planterChoice} onChange={(e) => setPlanterChoice(e.target.value)}>
              <option value="none">לא, עציץ בודד</option>
              {planters.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              <option value="new">+ תיבת גידול חדשה</option>
            </select>
          </label>
          {planterChoice === 'new' && (
            <fieldset className="subform">
              <label>
                שם התיבה
                <input value={newPlanter.name} maxLength={60} required
                  onChange={(e) => setNewPlanter({ ...newPlanter, name: e.target.value })} />
              </label>
              <Select label="חשיפה לשמש" value={newPlanter.sunExposure} options={SUNS}
                onChange={(v) => setNewPlanter({ ...newPlanter, sunExposure: v })} />
              <label>
                גודל (אופציונלי)
                <input value={newPlanter.sizeNotes} maxLength={200}
                  onChange={(e) => setNewPlanter({ ...newPlanter, sizeNotes: e.target.value })} />
              </label>
            </fieldset>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'שומר...' : submitLabel}</button>
    </form>
  );
}
