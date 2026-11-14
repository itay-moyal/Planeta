import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function IdentifyPage() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [teaser, setTeaser] = useState(null); // visitors only: a match exists, but no species

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError('');
    setCandidates([]);
    setTeaser(null);
    setLoading(true);

    const form = new FormData();
    form.append('image', file);
    try {
      const data = await api('/api/identify', { method: 'POST', body: form });
      if (data.teaser) setTeaser(data.teaser);
      else setCandidates(data.candidates);
    } catch (err) {
      setError(err.message); // already Hebrew
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <label className="upload">
        צלמו או העלו תמונה של צמח
        <input type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
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
