import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { AppError } from '../errors.js';

// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
// output_config.format = { type: 'json_schema', schema } makes the model answer with JSON matching the schema.
// Every object needs additionalProperties:false; minLength/maxLength/min/max are not supported, so we check them below.
const SYSTEM_PROMPT = readFileSync(new URL('../../prompts/care-plan.system.md', import.meta.url), 'utf8');

const text = { type: 'string' };
export const CARE_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: text,
    watering: text,
    light: text,
    placementTips: { type: 'array', items: text },
    unknown: { type: 'array', items: text },
  },
  required: ['summary', 'watering', 'light', 'placementTips', 'unknown'],
  additionalProperties: false,
};

const MAX_TEXT = 600;
const MAX_TIPS = 5;
const MAX_UNKNOWN = 10; // a plant can legitimately have many topics the data does not cover
const HEBREW = /[֐-׿]/;

// Allowlist: only these fields ever reach the model. No user id, email, nickname, city or plant nickname.
export function buildUserMessage({ species, careData, placement }) {
  const c = careData ?? {};
  return JSON.stringify({
    species: { scientificName: species.scientificName, commonName: c.commonName ?? species.commonName ?? null },
    careData: {
      watering: c.watering ?? null,
      wateringDays: c.wateringDays ?? null,
      sunlight: c.sunlight ?? [],
      indoor: c.indoor ?? null,
      poisonousToHumans: c.poisonousToHumans ?? null,
      poisonousToPets: c.poisonousToPets ?? null,
      careLevel: c.careLevel ?? null,
      cycle: c.cycle ?? null,
      hardiness: c.hardiness ?? null,
    },
    placement: {
      location: placement.location,
      windowDirection: placement.windowDirection ?? null,
      lightLevel: placement.lightLevel ?? null,
      sunExposure: placement.sunExposure ?? null,
      potSizeNotes: placement.potSizeNotes ?? null,
    },
  });
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;
const isTextList = (v, max) => Array.isArray(v) && v.length <= max && v.every(isText);

// The backend never trusts the model's JSON: check shape, sizes and that the text is Hebrew.
export function validateCarePlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const { summary, watering, light, placementTips, unknown } = plan;
  if (![summary, watering, light].every(isText)) return null;
  if (!isTextList(placementTips, MAX_TIPS) || !isTextList(unknown, MAX_UNKNOWN)) return null;
  if (!HEBREW.test(summary)) return null;
  return { summary: summary.trim(), watering: watering.trim(), light: light.trim(), placementTips: placementTips.map((t) => t.trim()), unknown: unknown.map((t) => t.trim()) };
}

let defaultClient = null;
const getClient = () => (defaultClient ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 60_000, maxRetries: 1 }));

// Returns { plan, model, usage: { inputTokens, outputTokens } }. Throws LLM_DISABLED / LLM_UNAVAILABLE.
// The caller counts the user's daily allowance BEFORE calling this.
export async function generateCarePlan(input, { client, model = config.carePlanModel } = {}) {
  if (config.llmKillSwitch) throw new AppError('LLM_DISABLED');
  if (!client && !config.anthropicApiKey) throw new AppError('LLM_UNAVAILABLE');

  let response;
  try {
    response = await (client ?? getClient()).messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      output_config: { format: { type: 'json_schema', schema: CARE_PLAN_SCHEMA } },
    });
  } catch (err) {
    console.error('Anthropic request failed with status', err?.status ?? 'none'); // never the key, prompt or reply
    throw new AppError('LLM_UNAVAILABLE');
  }

  const usage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
  console.log(`LLM care plan: model=${model} in=${usage.inputTokens} out=${usage.outputTokens}`); // counts only

  if (response.stop_reason !== 'end_turn') throw new AppError('LLM_UNAVAILABLE'); // refusal or cut off by max_tokens
  const block = (response.content ?? []).find((b) => b.type === 'text');
  let parsed = null;
  try {
    parsed = JSON.parse(block?.text ?? '');
  } catch {
    // fall through
  }
  const plan = validateCarePlan(parsed);
  if (!plan) throw new AppError('LLM_UNAVAILABLE');
  return { plan, model, usage };
}
