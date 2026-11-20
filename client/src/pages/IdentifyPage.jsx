import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PlacementForm from '../components/PlacementForm.jsx';

// Survives a refresh (so the user does not have to re-upload and spend a Pl@ntNet credit),
// but not closing the tab. Holds public species data only: no photo, no personal data.
const STORAGE_KEY = 'planeta_identify';

function readStored(userId) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return stored?.userId === userId ? stored : null; // never show another user's results
  } catch {
    return null;
  }
}

function writeStored(userId, candidates, chosen) {
  try {
    if (candidates.length === 0 && !chosen) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, candidates, chosen }));
  } catch {
    // storage blocked: the page still works, it just will not survive a refresh
  }
}

export default function IdentifyPage() {
  const { user, setUser } = useAuth();
  const left = user?.identificationsLeft; // the user's own daily allowance (undefined for visitors)
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [chosen, setChosen] = useState(null); // the plant the user confirmed, waiting for placement
  const [teaser, setTeaser] = useState(null); // visitors only: a match exists, but no species
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [saved, setSaved] = useState(null);
  const restoredFor = useRef(null);

  // Every change to candidates/chosen goes through here so sessionStorage stays in sync.
  function update(nextCandidates, nextChosen) {
    setCandidates(nextCandidates);
    setChosen(nextChosen);
    if (user) writeStored(user.id, nextCandidates, nextChosen);
  }

  // Once per login: restore from sessionStorage, otherwise claim the result held for us as a visitor.
  useEffect(() => {
    if (!user || restoredFor.current === user.id) return;
    restoredFor.current = user.id; // the claim works once, so never fire it twice (React Strict Mode)
    const stored = readStored(user.id);
    if (stored) {
      setCandidates(stored.candidates ?? []);
      setChosen(stored.chosen ?? null);
      return;
    }
    api('/api/identify/claim', { method: 'POST' })
      .then((data) => {
        setCandidates(data.candidates);
        writeStored(user.id, data.candidates, null);
      })
      .catch(() => {}); // nothing held (or expired): this is just a normal visit
  }, [user]);

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError('');
    setTeaser(null);
    setManualOpen(false);
    setSaved(null);
    update([], null);
    setLoading(true);

    const form = new FormData();
    form.append('image', file);
    try {
      const data = await api('/api/identify', { method: 'POST', body: form });
      if (data.teaser) setTeaser(data.teaser);
      else {
        update(data.candidates, null);
        setUser((u) => ({ ...u, identificationsLeft: data.identificationsLeft }));
      }
    } catch (err) {
      setError(err.message); // already Hebrew
      if (err.code === 'DAILY_LIMIT') setUser((u) => ({ ...u, identificationsLeft: 0 }));
    } finally {
      setLoading(false);
    }
  }

  function chooseCandidate(c) {
    update(candidates, {
      species: { scientificName: c.scientificName, commonNames: c.commonNames },
      source: 'candidate',
      confidence: c.score,
      referenceImageUrl: c.referenceImages[0] ?? '',
      defaultName: c.commonNames[0] ?? c.scientificName,
    });
  }

  function chooseManual(e) {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    update(candidates, {
      species: { scientificName: name, commonNames: [name] },
      source: 'manual',
      confidence: null,
      referenceImageUrl: '',
      defaultName: name,
    });
  }

  async function savePlant({ name, placement, planterId }) {
    const body = {
      name,
      species: chosen.species,
      identificationSource: chosen.source,
      placement,
    };
    if (chosen.source === 'candidate') body.identificationConfidence = chosen.confidence;
    if (chosen.referenceImageUrl) body.referenceImageUrl = chosen.referenceImageUrl;
    if (planterId) body.planterId = planterId;

    const data = await api('/api/plants', { method: 'POST', json: body });
    update([], null); // done with this identification
    setPreview(null);
    setManualOpen(false);
    setManualName('');
    setSaved(data.plant);
  }

  if (saved) {
    return (
      <main>
        <div className="teaser">
          <p className="success">הצמח "{saved.name}" נשמר ✓</p>
          <button type="button" className="primary" onClick={() => setSaved(null)}>הוספת צמח נוסף</button>
          <p><Link to="/plants">לרשימת הצמחים שלי</Link></p>
        </div>
      </main>
    );
  }

  if (chosen) {
    return (
      <main>
        <h1>{chosen.defaultName}</h1>
        {chosen.source === 'candidate' && <p className="sci">{chosen.species.scientificName}</p>}
        <button type="button" className="link-button" onClick={() => update(candidates, null)}>
          חזרה לתוצאות
        </button>
        <PlacementForm initial={{ name: chosen.defaultName }} submitLabel="שמירת הצמח" onSubmit={savePlant} />
      </main>
    );
  }

  return (
    <main>
      {left !== undefined && (
        <p className="allowance">
          {left === 0
            ? 'הגעתם למגבלת הזיהויים להיום. אפשר להמשיך מחר.'
            : left === 1 ? 'נשאר לכם זיהוי אחד היום' : `נשארו לכם ${left} זיהויים היום`}
        </p>
      )}
      <label className={left === 0 ? 'upload disabled' : 'upload'}>
        צלמו או העלו תמונה של צמח
        <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={left === 0} hidden />
      </label>

      {preview && <img className="preview" src={preview} alt="התמונה שהועלתה" />}
      {loading && <p>מזהה...</p>}
      {error && <p className="error">{error}</p>}

      {teaser && (
        <div className="teaser">
          <p>מצאנו התאמה! רמת ביטחון: {Math.round(teaser.topScore * 100)}%</p>
          <p>כדי לראות איזה צמח זה, נא להירשם או להתחבר.</p>
          <Link className="primary" to="/login" state={{ from: '/', mode: 'signup' }}>הרשמה</Link>
        </div>
      )}

      <ul className="candidates">
        {candidates.map((c) => (
          <li key={c.scientificName}>
            <div>
              <strong>{c.commonNames[0] ?? c.scientificName}</strong>
              <div className="sci">{c.scientificName}</div>
              <div>{Math.round(c.score * 100)}% התאמה</div>
              <button type="button" className="primary small" onClick={() => chooseCandidate(c)}>
                זה הצמח שלי
              </button>
            </div>
            {c.referenceImages.map((url) => (
              <img key={url} src={url} alt="" />
            ))}
          </li>
        ))}
      </ul>

      {candidates.length > 0 && (
        manualOpen ? (
          <form className="form" onSubmit={chooseManual}>
            <label>
              שם הצמח
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} maxLength={100} required />
            </label>
            <button type="submit" className="primary">המשך</button>
          </form>
        ) : (
          <button type="button" className="link-button" onClick={() => setManualOpen(true)}>
            אף אחד מאלה? הזינו שם ידנית
          </button>
        )
      )}

      <footer>זיהוי באמצעות Pl@ntNet</footer>
    </main>
  );
}
