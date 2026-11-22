import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import CarePanel from '../components/CarePanel.jsx';
import PlacementForm,{ LIGHTS, SUNS, WINDOWS } from '../components/PlacementForm.jsx';

const label = (pairs, value) => pairs.find(([v]) => v === value)?.[1];

function describePlacement(p) {
  const parts = p.location === 'indoor'
    ? ['בתוך הבית',
      p.windowDirection && `חלון ${label(WINDOWS, p.windowDirection)}`,
      p.lightLevel && `רמת אור ${label(LIGHTS, p.lightLevel)}`]
    : [p.location === 'garden' ? 'גינה' : 'מרפסת',
      p.sunExposure && label(SUNS, p.sunExposure),
      p.potSizeNotes];
  return parts.filter(Boolean).join(' · ');
}

export default function PlantsPage() {
  const [plants, setPlants] = useState(null); // null = still loading
  const [planters, setPlanters] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/api/plants'), api('/api/planters')])
      .then(([p, pl]) => {
        setPlants(p.plants);
        setPlanters(pl.planters);
      })
      .catch((err) => {
        setError(err.message);
        setPlants([]);
      });
  }, []);

  async function savePlant(plant, { name, placement, planterId }) {
    const data = await api(`/api/plants/${plant.id}`, { method: 'PATCH', json: { name, placement, planterId } });
    setPlants((list) => list.map((p) => (p.id === plant.id ? data.plant : p)));
    // The form may have created a planter: refresh the names we show.
    api('/api/planters').then((pl) => setPlanters(pl.planters)).catch(() => {});
    setEditingId(null);
  }

  async function removePlant(plant) {
    if (!window.confirm(`למחוק את "${plant.name}"? אי אפשר לשחזר.`)) return;
    setError('');
    try {
      await api(`/api/plants/${plant.id}`, { method: 'DELETE' });
      setPlants((list) => list.filter((p) => p.id !== plant.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (plants === null) return <main><p>טוען...</p></main>;

  const planterName = (id) => planters.find((pl) => pl.id === id)?.name;

  return (
    <main>
      <h1>הצמחים שלי</h1>
      {error && <p className="error">{error}</p>}
      {plants.length === 0 && !error && (
        <p>עדיין אין צמחים. <Link to="/">הוסיפו את הצמח הראשון</Link></p>
      )}
      <ul className="plants">
        {plants.map((plant) => (
          <li key={plant.id}>
            {editingId === plant.id ? (
              <PlacementForm
                initial={{ name: plant.name, placement: plant.placement, planterId: plant.planterId }}
                submitLabel="שמירה"
                onSubmit={(values) => savePlant(plant, values)}
              />
            ) : (
              <div className="plant-row">
                {plant.referenceImageUrl ? <img src={plant.referenceImageUrl} alt="" /> : <div className="thumb">🌿</div>}
                <div>
                  <strong>{plant.name}</strong>
                  <div className="sci">{plant.species.scientificName}</div>
                  <div>{describePlacement(plant.placement)}</div>
                  {plant.planterId && planterName(plant.planterId) && <div>{plant.placement.location === 'garden' ? 'ערוגה' : 'אדנית'}: {planterName(plant.planterId)}</div>}
                  <div className="actions">
                    <button type="button" className="link-button" onClick={() => setEditingId(plant.id)}>עריכה</button>
                    <button type="button" className="link-button danger" onClick={() => removePlant(plant)}>מחיקה</button>
                  </div>
                </div>
              </div>
            )}
            {editingId !== plant.id && <CarePanel plantId={plant.id} placementSig={JSON.stringify(plant.placement)} />}
            {editingId === plant.id && (
              <button type="button" className="link-button" onClick={() => setEditingId(null)}>ביטול</button>
            )}
          </li>
        ))}
      </ul>
      <p><Link to="/">הוספת צמח</Link></p>
    </main>
  );
}
