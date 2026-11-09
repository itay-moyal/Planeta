import { useState } from 'react';

export default function App() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError('');
    setCandidates([]);
    setLoading(true);

    const form = new FormData();
    form.append('image', file);
    try {
      const res = await fetch('/api/identify', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) setError(data.error?.message ?? 'אירעה שגיאה. נסו שוב.');
      else setCandidates(data.candidates);
    } catch {
      setError('אין חיבור לשרת. בדקו את החיבור לרשת ונסו שוב.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Planeta 🌿</h1>
      <label className="upload">
        צלמו או העלו תמונה של צמח
        <input type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
      </label>

      {preview && <img className="preview" src={preview} alt="התמונה שהועלתה" />}
      {loading && <p>מזהה...</p>}
      {error && <p className="error">{error}</p>}

      <ul className="candidates">
        {candidates.map((c) => (
          <li key={c.scientificName}>
            <div>
              <strong>{c.commonNames[0] ?? c.scientificName}</strong>
              <div className="sci">{c.scientificName}</div>
              <div>{Math.round(c.score * 100)}% התאמה</div>
            </div>
            {c.referenceImages.map((url) => (
              <img key={url} src={url} alt="" />
            ))}
          </li>
        ))}
      </ul>

      <footer>זיהוי באמצעות Pl@ntNet</footer>
    </main>
  );
}
