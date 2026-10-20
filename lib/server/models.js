// Models used for valuation/forecast generation, tried in order until one
// succeeds. The list leads with a known-working model and keeps current free
// candidates as fallbacks, so provider rate limits cannot hard-fail a forecast.
//
// To pin an exact model, set VALUATION_MODELS in Vercel to a comma-separated
// list — it fully replaces this default, e.g.
//   VALUATION_MODELS=google/gemma-4-31b-it:free,deepseek/deepseek-chat
const DEFAULT_MODELS = [
  // Lead with the known-working model so a rate-limited/slow free provider
  // cannot consume the whole forecast request before fallback is attempted.
  'deepseek/deepseek-chat',
  // Current free candidates remain available as lower-cost fallbacks.
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

export function getValuationModels() {
  const fromEnv = String(process.env.VALUATION_MODELS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_MODELS;
}
