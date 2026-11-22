import { describe, it, expect } from 'vitest';
import { computeWarnings, sunlightRange, wateringLevel } from '../src/services/warnings.js';
import { placementKey } from '../src/services/care.service.js';

const data = (over = {}) => ({ watering: 'Average', sunlight: ['full sun'], poisonousToPets: false, poisonousToHumans: false, ...over });
const codes = (w) => w.map((x) => x.code);

describe('computeWarnings', () => {
  it('warns about pets and humans only when the data says true (not for false or unknown)', () => {
    expect(codes(computeWarnings({ careData: data({ poisonousToPets: true, poisonousToHumans: true }) }))).toEqual(['PET_TOXIC', 'HUMAN_TOXIC']);
    expect(computeWarnings({ careData: data() })).toEqual([]);
    expect(computeWarnings({ careData: data({ poisonousToPets: null, poisonousToHumans: null }) })).toEqual([]);
    expect(computeWarnings({ careData: null })).toEqual([]);
  });

  it('frames toxicity as information from the database', () => {
    const [w] = computeWarnings({ careData: data({ poisonousToPets: true }) });
    expect(w.message).toMatch(/לפי מאגר המידע/);
  });

  it('flags watering needs two or more levels apart, but not one level', () => {
    const mate = (watering) => ({ name: 'Cactus', careData: data({ watering }) });
    expect(codes(computeWarnings({ careData: data({ watering: 'Frequent' }), mates: [mate('Minimum')] }))).toContain('PLANTER_WATERING');
    expect(codes(computeWarnings({ careData: data({ watering: 'Frequent' }), mates: [mate('Average')] }))).not.toContain('PLANTER_WATERING');
    expect(codes(computeWarnings({ careData: data({ watering: 'Average' }), mates: [mate('Minimum')] }))).not.toContain('PLANTER_WATERING');
  });

  it('flags light ranges that are far apart, but not neighbours', () => {
    const mate = (sunlight) => ({ name: 'Fern', careData: data({ sunlight }) });
    expect(codes(computeWarnings({ careData: data({ sunlight: ['full sun'] }), mates: [mate(['part shade'])] }))).toContain('PLANTER_LIGHT');
    expect(codes(computeWarnings({ careData: data({ sunlight: ['full sun'] }), mates: [mate(['part sun/part shade'])] }))).not.toContain('PLANTER_LIGHT');
    expect(codes(computeWarnings({ careData: data({ sunlight: ['full sun', 'part shade'] }), mates: [mate(['filtered shade', 'part shade'])] }))).not.toContain('PLANTER_LIGHT');
  });

  it('judges a pair only when both plants have data', () => {
    const w = computeWarnings({ careData: data({ watering: 'Frequent' }), mates: [{ name: 'Unknown plant', careData: null }] });
    expect(w).toEqual([]);
    expect(computeWarnings({ careData: data({ watering: 'Frequent', sunlight: [] }), mates: [{ name: 'X', careData: data({ watering: 'Average', sunlight: [] }) }] })).toEqual([]);
  });

  it('names the mate in a planter warning', () => {
    const [w] = computeWarnings({ careData: data({ watering: 'Frequent' }), mates: [{ name: 'Aloe', careData: data({ watering: 'Minimum' }) }] });
    expect(w).toMatchObject({ code: 'PLANTER_WATERING', mate: 'Aloe' });
    expect(w.message).toMatch(/Aloe/);
  });
});

describe('scales', () => {
  it('ignores unknown words instead of guessing', () => {
    expect(wateringLevel('Sometimes')).toBeNull();
    expect(wateringLevel(' frequent ')).toBe(3);
    expect(sunlightRange(['moonlight'])).toBeNull();
    expect(sunlightRange(['full sun', 'part shade', 'moonlight'])).toEqual([2, 4]);
  });
});

describe('placementKey', () => {
  it('changes with the placement and stays the same otherwise', () => {
    const a = { location: 'balcony', sunExposure: 'full' };
    expect(placementKey(a)).toBe(placementKey({ ...a }));
    expect(placementKey(a)).not.toBe(placementKey({ location: 'indoor', lightLevel: 'low' }));
    expect(placementKey(a)).not.toBe(placementKey({ ...a, sunExposure: 'shade' }));
    expect(placementKey({ location: 'indoor' })).not.toBe(placementKey({ location: 'garden' }));
  });
});
