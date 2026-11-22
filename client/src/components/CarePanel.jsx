import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Care plan for one plant. It reads (GET, free) only when opened, and spends an LLM call
// (POST) only when the user presses a button, or right after a plant is first saved.
export default function CarePanel({ plantId, placementSig }) {
  const [open, setOpen] = useState(false);
  const [care, setCare] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); // a plan is being generated
  const [error, setError] = useState('');

  // Load when opened, and again if the placement changes while open (the plan may now be stale).
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/api/plants/${plantId}/care`)
      .then((data) => !cancelled && setCare(data.care))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, plantId, placementSig]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/plants/${plantId}/care`, { method: 'POST' });
      setCare(data.care);
    } catch (err) {
      setError(err.message); // already Hebrew: limit reached, switched off, unavailable, being prepared
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setLoading(true);
    setError('');
    try {
      setCare((await api(`/api/plants/${plantId}/care`)).care);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const plan = care?.plan;

  return (
    <div className="care">
      <button type="button" className="link-button" onClick={() => setOpen((o) => !o)}>
        {open ? 'סגירת תוכנית הטיפול' : 'תוכנית טיפול'}
      </button>
      {open && (
        <div className="care-body">
          {loading && !care && <p>טוען...</p>}
          {error && <p className="error">{error}</p>}
          {!care && error && !loading && <button type="button" className="link-button" onClick={reload}>ניסיון חוזר</button>}

          {care?.warnings?.length > 0 && (
            <ul className="care-warnings">
              {care.warnings.map((w) => <li key={`${w.code}-${w.mate ?? ''}`}>{w.message}</li>)}
            </ul>
          )}

          {care?.status === 'none' && !busy && (
            <button type="button" className="primary small" onClick={generate}>יצירת תוכנית טיפול</button>
          )}
          {busy && <p>מכינים תוכנית...</p>}
          {care?.generating && !busy && (
            <p>התוכנית בהכנה. <button type="button" className="link-button" onClick={reload}>רענון</button></p>
          )}

          {care?.status === 'no_data' && (
            <p>אין לנו כרגע מידע טיפול על הצמח הזה, ולכן לא ניצור עבורו תוכנית.</p>
          )}

          {plan && (
            <>
              {care.stale && (
                <p className="care-stale">
                  התוכנית נכתבה למיקום קודם של הצמח.{' '}
                  {!busy && <button type="button" className="link-button" onClick={generate}>עדכון התוכנית</button>}
                </p>
              )}
              <p>{plan.summary}</p>
              <p><strong>השקיה:</strong> {plan.watering}</p>
              <p><strong>אור:</strong> {plan.light}</p>
              {plan.placementTips.length > 0 && (
                <ul>{plan.placementTips.map((t) => <li key={t}>{t}</li>)}</ul>
              )}
              {plan.unknown.length > 0 && <p className="care-unknown">אין לנו מידע על: {plan.unknown.join(', ')}</p>}
              <p className="care-note">התוכנית נוצרה בעזרת בינה מלאכותית על בסיס נתוני Perenual. מידע בלבד, לא ייעוץ מקצועי.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
