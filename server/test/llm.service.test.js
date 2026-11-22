import { describe, it, expect, beforeEach, vi } from 'vitest';

// The Anthropic API is never called here: a fake client stands in for it.
let mod;
beforeEach(async () => {
  vi.resetModules();
  delete process.env.LLM_KILL_SWITCH;
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  mod = await import('../src/services/llm.service.js');
});

const input = {
  species: { scientificName: 'Dieffenbachia seguine', commonName: 'dumb cane' },
  careData: { commonName: 'dumb cane', watering: 'Average', wateringDays: { min: 7, max: 10 }, sunlight: ['filtered shade'], poisonousToPets: true, poisonousToHumans: true },
  placement: { location: 'indoor', windowDirection: 'E', lightLevel: 'medium' },
};
const goodPlan = { summary: 'צמח לבית עם אור בינוני.', watering: 'השקיה ממוצעת, כל 7-10 ימים.', light: 'צל מסונן.', placementTips: ['הרחיקו מחיות מחמד'], unknown: ['טמפרטורה'] };
const reply = (body, extra = {}) => ({ stop_reason: 'end_turn', usage: { input_tokens: 400, output_tokens: 150 }, content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }], ...extra });
const fakeClient = (r) => ({ messages: { create: vi.fn(async () => r) } });

describe('generateCarePlan', () => {
  it('returns a validated plan with token usage, and asks for the JSON schema', async () => {
    const client = fakeClient(reply(goodPlan));
    const out = await mod.generateCarePlan(input, { client, model: 'claude-haiku-5-5' });
    expect(out.plan).toEqual(goodPlan);
    expect(out.usage).toEqual({ inputTokens: 400, outputTokens: 150 });
    const req = client.messages.create.mock.calls[0][0];
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.output_config.format).toMatchObject({ type: 'json_schema', schema: mod.CARE_PLAN_SCHEMA });
    expect(req.system).toMatch(/ONLY the facts/);
  });

  it('sends only plant data: no user id, email, name or city reaches the prompt', async () => {
    const dirty = {
      ...input,
      userId: '64b000000000000000000001', email: 'secret@example.com', name: 'Itay', city: 'Tel Aviv',
      species: { ...input.species, nickname: 'Fernando' },
      placement: { ...input.placement, userId: '64b000000000000000000001' },
    };
    const client = fakeClient(reply(goodPlan));
    await mod.generateCarePlan(dirty, { client });
    const req = client.messages.create.mock.calls[0][0];
    const sent = JSON.stringify(req);
    expect(sent).not.toMatch(/secret@example|Itay|Tel Aviv|Fernando|64b000000000000000000001|test-anthropic-key/);
    expect(sent).toMatch(/Dieffenbachia seguine/);
  });

  it.each([
    ['not JSON', reply('hello')],
    ['a missing field', reply({ ...goodPlan, light: undefined })],
    ['an extra-long text', reply({ ...goodPlan, summary: 'א'.repeat(601) })],
    ['no Hebrew in the summary', reply({ ...goodPlan, summary: 'A plant for indoors.' })],
    ['too many unknown topics', reply({ ...goodPlan, unknown: Array.from({ length: 11 }, () => 'א') })],
    ['too many tips',reply({ ...goodPlan, placementTips: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] })],
    ['a refusal', reply(goodPlan, { stop_reason: 'refusal' })],
    ['a reply cut off by max_tokens', reply(goodPlan, { stop_reason: 'max_tokens' })],
  ])('rejects %s as LLM_UNAVAILABLE', async (_name, r) => {
    await expect(mod.generateCarePlan(input, { client: fakeClient(r) })).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
  });

  it('maps an API error to LLM_UNAVAILABLE without leaking details', async () => {
    const client = { messages: { create: vi.fn(async () => { throw Object.assign(new Error('credit balance is too low sk-secret'), { status: 400 }); }) } };
    const err = await mod.generateCarePlan(input, { client }).catch((e) => e);
    expect(err.code).toBe('LLM_UNAVAILABLE');
    expect(JSON.stringify({ m: err.message, u: err.userMessage })).not.toMatch(/sk-secret|credit/);
  });

  it('does nothing when the kill switch is on', async () => {
    vi.resetModules();
    process.env.LLM_KILL_SWITCH = 'true';
    const off = await import('../src/services/llm.service.js');
    const client = fakeClient(reply(goodPlan));
    await expect(off.generateCarePlan(input, { client })).rejects.toMatchObject({ code: 'LLM_DISABLED' });
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('is unavailable without an API key', async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const noKey = await import('../src/services/llm.service.js');
    await expect(noKey.generateCarePlan(input)).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
  });
});
