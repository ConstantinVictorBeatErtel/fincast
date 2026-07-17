// Models used for valuation/forecast generation, tried in order until one
// succeeds. The list leads with free OpenRouter models and ends with a
// known-working paid model as a guaranteed fallback, so a retired/invalid
// free slug or an empty free-tier allowance can never hard-fail a forecast.
//
// To pin an exact model (e.g. the precise "NVIDIA: Nemotron 3 Ultra (free)"
// slug copied from its OpenRouter model page), set VALUATION_MODELS in Vercel
// to a comma-separated list — it fully replaces this default, e.g.
//   VALUATION_MODELS=nvidia/nemotron-3-ultra:free,deepseek/deepseek-chat
const DEFAULT_MODELS = [
  // Free models (used first — no cost when they succeed).
  'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  // Guaranteed fallback: the model the app shipped with and is known to work.
  'deepseek/deepseek-chat',
];

export function getValuationModels() {
  const fromEnv = String(process.env.VALUATION_MODELS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_MODELS;
}
