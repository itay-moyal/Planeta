import { useEffect, useState } from 'react';
import { api } from '../api.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// The server's public key arrives as url-safe base64; the browser wants bytes.
function keyToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Turns reminders on for THIS device. The browser only shows its permission prompt after a tap, so it all starts from a button.
export default function PushSetup() {
  const [info, setInfo] = useState(null); // what the server says: is push set up, and the public key
  const [subscribed, setSubscribed] = useState(false); // is this device subscribed
  const [permission, setPermission] = useState(supported() ? Notification.permission : 'unsupported');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/push/status').then(setInfo).catch((err) => setError(err.message));
    if (supported()) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(Boolean(sub)))
        .catch(() => {});
    }
  }, []);

  async function run(action) {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await action();
    } catch (err) {
      setError(err.message || 'משהו השתבש. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  const enable = () => run(async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(info.publicKey) });
    await api('/api/push/subscribe', { method: 'POST', json: sub.toJSON() });
    setSubscribed(true);
    setNote('התזכורות הופעלו ✓');
  });

  const disable = () => run(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/subscribe', { method: 'DELETE', json: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    setSubscribed(false);
    setNote('התזכורות כובו במכשיר הזה.');
  });

  const sendTest = () => run(async () => {
    await api('/api/push/test', { method: 'POST' });
    setNote('נשלחה התראת בדיקה. היא אמורה להופיע תוך רגע.');
  });

  let body;
  if (!info) {
    body = <p>טוען...</p>;
  } else if (!info.configured) {
    body = <p>התראות עדיין לא מוגדרות בשרת.</p>;
  } else if (!supported()) {
    body = isIos() && !isStandalone() ? (
      <>
        <p>באייפון אפשר לקבל תזכורות רק אחרי שמוסיפים את Planeta למסך הבית (נדרש iOS 16.4 ומעלה):</p>
        <ol>
          <li>פתחו את האתר ב-Safari.</li>
          <li>לחצו על כפתור השיתוף (הריבוע עם החץ).</li>
          <li>בחרו "הוספה למסך הבית".</li>
          <li>פתחו את Planeta מהמסך הבית (לא מ-Safari) והתחברו.</li>
          <li>חזרו לכאן ולחצו "הפעלת תזכורות".</li>
        </ol>
      </>
    ) : (
      <p>הדפדפן הזה לא תומך בהתראות.</p>
    );
  } else if (permission === 'denied') {
    body = <p>ההתראות חסומות למכשיר הזה. כדי לאפשר אותן, פתחו את הגדרות המכשיר או הדפדפן ואשרו התראות עבור Planeta.</p>;
  } else if (subscribed) {
    body = (
      <>
        <p className="success">✓ תזכורות פעילות במכשיר הזה</p>
        <div className="actions">
          <button type="button" className="link-button" onClick={sendTest} disabled={busy}>שליחת התראת בדיקה</button>
          <button type="button" className="link-button danger" onClick={disable} disabled={busy}>כיבוי במכשיר הזה</button>
        </div>
      </>
    );
  } else {
    body = <button type="button" className="primary" onClick={enable} disabled={busy}>{busy ? 'מפעיל...' : 'הפעלת תזכורות בטלפון'}</button>;
  }

  return (
    <section className="push-box">
      <h2>תזכורות בטלפון</h2>
      {body}
      {note && <p className="success">{note}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
