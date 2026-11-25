import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PushSetup from '../components/PushSetup.jsx';

function timezoneOptions(current) {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    // older browsers: fall back to just the current value
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [city, setCity] = useState(user.city);
  const [timezone, setTimezone] = useState(user.timezone);
  const [reminderTime, setReminderTime] = useState(user.reminderTime);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      const data = await api('/api/me', {
        method: 'PATCH',
        json: { city, timezone, reminderTime },
      });
      setUser(data.user); // keep the shared user in sync
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>הגדרות</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          עיר (לתחזית מזג האוויר)
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
        </label>
        <label>
          אזור זמן
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} dir="ltr">
            {timezoneOptions(user.timezone).map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
        <label>
          באיזו שעה להזכיר לי להשקות (לפי אזור הזמן שלך)
          <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} required dir="ltr" />
        </label>
        {error && <p className="error">{error}</p>}
        {saved && <p className="success">נשמר ✓</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'שומר...' : 'שמירה'}</button>
      </form>
      <PushSetup />
    </main>
  );
}
