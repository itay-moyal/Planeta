// Warnings are plain code over the stored care data. The LLM never writes them.
// Toxicity text is information from the database, not veterinary or medical advice.

// Perenual's watering categories on one scale. Unknown words are ignored (null), never guessed.
const WATERING = { frequent: 3, average: 2, minimum: 1, none: 0 };
// Perenual's sunlight words on one scale, from deep shade (0) to full sun (4).
const SUNLIGHT = { 'deep shade': 0, 'full shade': 0, 'filtered shade': 1, 'part shade': 2, 'part sun/part shade': 3, 'part sun': 3, 'full sun': 4 };

export const wateringLevel = (category) => WATERING[String(category ?? '').trim().toLowerCase()] ?? null;

// The range of light a plant accepts, as [lowest, highest], or null if no word is recognised.
export function sunlightRange(list) {
  const levels = (Array.isArray(list) ? list : []).map((s) => SUNLIGHT[String(s).trim().toLowerCase()]).filter((n) => n !== undefined);
  return levels.length ? [Math.min(...levels), Math.max(...levels)] : null;
}

// Two plants clash on light when their accepted ranges are two or more steps apart.
function lightGap(a, b) {
  const ra = sunlightRange(a);
  const rb = sunlightRange(b);
  if (!ra || !rb) return null;
  return Math.max(ra[0] - rb[1], rb[0] - ra[1], 0);
}

// careData: this plant's cached care data (or null). mates: [{ name, careData }] for the plants in the same planter.
export function computeWarnings({ careData, mates = [] }) {
  const out = [];
  if (careData?.poisonousToPets === true) {
    out.push({ code: 'PET_TOXIC', message: 'לפי מאגר המידע, הצמח רעיל לחיות מחמד. כדאי למקם אותו הרחק מהישג ידן.' });
  }
  if (careData?.poisonousToHumans === true) {
    out.push({ code: 'HUMAN_TOXIC', message: 'לפי מאגר המידע, הצמח רעיל לבני אדם. כדאי לשמור אותו הרחק מילדים קטנים.' });
  }
  if (careData) {
    for (const mate of mates) {
      if (!mate.careData) continue; // a pair is only judged when both plants have data
      const a = wateringLevel(careData.watering);
      const b = wateringLevel(mate.careData.watering);
      if (a !== null && b !== null && Math.abs(a - b) >= 2) {
        out.push({ code: 'PLANTER_WATERING', mate: mate.name, message: `הצמח הזה והצמח "${mate.name}" באותה ערוגה או אדנית צריכים כמויות השקיה שונות מאוד.` });
      }
      const gap = lightGap(careData.sunlight, mate.careData.sunlight);
      if (gap !== null && gap >= 2) {
        out.push({ code: 'PLANTER_LIGHT', mate: mate.name, message: `הצמח הזה והצמח "${mate.name}" באותה ערוגה או אדנית מעדיפים רמות אור שונות מאוד.` });
      }
    }
  }
  return out;
}
