import { describe, it, expect, beforeAll } from 'vitest';

process.env.PLANTNET_API_KEY = 'test-key';
let identifyPlant;
beforeAll(async () => {
  ({ identifyPlant } = await import('../src/services/plantnet.service.js'));
});

const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' };
const reply = (status, body = {}) => async () => ({ ok: status < 400, status, json: async () => body });

describe('identifyPlant', () => {
  it('maps the top results to candidates', async () => {
    const body = {
      remainingIdentificationRequests: 99,
      results: [
        { score: 0.9, species: { scientificNameWithoutAuthor: 'Mentha spicata', commonNames: ['נענע'], family: { scientificNameWithoutAuthor: 'Lamiaceae' } }, images: [{ url: { m: 'http://img/m.jpg' } }] },
        { score: 0.05, species: { scientificNameWithoutAuthor: 'A' } },
        { score: 0.03, species: { scientificNameWithoutAuthor: 'B' } },
        { score: 0.02, species: { scientificNameWithoutAuthor: 'C' } },
      ],
    };
    const out = await identifyPlant(file, reply(200, body));
    expect(out.candidates).toHaveLength(3);
    expect(out.candidates[0]).toMatchObject({ scientificName: 'Mentha spicata', score: 0.9, referenceImages: ['http://img/m.jpg'] });
  });

  it.each([
    [404, 'NOT_A_PLANT'],
    [429, 'QUOTA_REACHED'],
    [500, 'UPSTREAM_FAILED'],
  ])('maps status %i to %s', async (status, code) => {
    await expect(identifyPlant(file, reply(status))).rejects.toMatchObject({ code });
  });

  it('maps a network failure to UPSTREAM_FAILED', async () => {
    const down = async () => { throw new Error('offline'); };
    await expect(identifyPlant(file, down)).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
  });
});
