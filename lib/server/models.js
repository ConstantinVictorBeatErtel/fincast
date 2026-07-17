// Free OpenRouter models used for valuation/forecast generation, in priority
// order. If a slug is retired or rejected by OpenRouter, callers fall through
// to the next entry. Override without a code change by setting VALUATION_MODELS
// in Vercel to a comma-separated list, e.g.
//   VALUATION_MODELS=nvidia/nemotron-3-ultra:free,deepseek/deepseek-chat-v3-0324:free
const DEFAULT_FREE_MODELS = [
  'nvidia/nemotron-3-ultra:free',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

export function getValuationModels() {
  const fromEnv = String(process.env.VALUATION_MODELS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_FREE_MODELS;
}
