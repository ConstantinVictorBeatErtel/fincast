/**
 * Arize AX tracing for Fincast's LLM workflows.
 *
 * Spans follow the OpenInference semantic conventions (the attribute names
 * Arize AX reads) and are exported over OTLP/HTTP to Arize.
 *
 * Design notes:
 * - Tracing is OFF unless both ARIZE_SPACE_ID and ARIZE_API_KEY are set. When
 *   off, every helper here is a plain pass-through.
 * - The OpenTelemetry SDK is loaded lazily inside a try/catch, so a missing
 *   package or an unsupported Node version disables tracing instead of
 *   breaking a valuation request.
 * - The tracer provider is private (not registered globally), so Next.js'
 *   own framework spans are not shipped to Arize — only the spans below.
 * - Route handlers run on serverless functions, so `traceRequest` flushes
 *   the span batch before the response is returned.
 */
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

const DEFAULT_OTLP_ENDPOINT = 'https://otlp.arize.com/v1/traces';
const DEFAULT_PROJECT_NAME = 'fincast';
const FLUSH_TIMEOUT_MS = 3000;
const MAX_ATTRIBUTE_CHARS = 100_000;
const STATE_KEY = Symbol.for('fincast.arize.tracing');

// OpenInference attribute names.
// https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md
const ATTR = {
  PROJECT_NAME: 'openinference.project.name',
  SPAN_KIND: 'openinference.span.kind',
  INPUT_VALUE: 'input.value',
  INPUT_MIME_TYPE: 'input.mime_type',
  OUTPUT_VALUE: 'output.value',
  OUTPUT_MIME_TYPE: 'output.mime_type',
  METADATA: 'metadata',
  TAGS: 'tag.tags',
  TOOL_NAME: 'tool.name',
  LLM_MODEL_NAME: 'llm.model_name',
  LLM_PROVIDER: 'llm.provider',
  LLM_INVOCATION_PARAMETERS: 'llm.invocation_parameters',
  LLM_INPUT_MESSAGES: 'llm.input_messages',
  LLM_OUTPUT_MESSAGES: 'llm.output_messages',
  LLM_TOKEN_COUNT_PROMPT: 'llm.token_count.prompt',
  LLM_TOKEN_COUNT_COMPLETION: 'llm.token_count.completion',
  LLM_TOKEN_COUNT_TOTAL: 'llm.token_count.total',
  LLM_COST_TOTAL: 'llm.cost.total',
};

const erroredSpans = new WeakSet();
const spanMetadata = new WeakMap();

function readConfig() {
  const spaceId = process.env.ARIZE_SPACE_ID;
  const apiKey = process.env.ARIZE_API_KEY;
  if (!spaceId || !apiKey) return null;
  return {
    spaceId,
    apiKey,
    projectName: process.env.ARIZE_PROJECT_NAME || DEFAULT_PROJECT_NAME,
    endpoint: process.env.ARIZE_OTLP_ENDPOINT || DEFAULT_OTLP_ENDPOINT,
  };
}

// Named export lookup that tolerates CJS/ESM interop differences.
function pick(mod, name) {
  const value = mod?.[name] ?? mod?.default?.[name];
  if (!value) throw new Error(`missing export "${name}"`);
  return value;
}

async function initTracing() {
  const config = readConfig();
  if (!config) return null;

  try {
    const [sdk, exporterModule, resources, asyncHooks] = await Promise.all([
      import('@opentelemetry/sdk-trace'),
      import('@opentelemetry/exporter-trace-otlp-proto'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/context-async-hooks'),
    ]);

    const TracerProvider = pick(sdk, 'TracerProvider');
    const BatchSpanProcessor = pick(sdk, 'BatchSpanProcessor');
    const OTLPTraceExporter = pick(exporterModule, 'OTLPTraceExporter');
    const resourceFromAttributes = pick(resources, 'resourceFromAttributes');
    const AsyncLocalStorageContextManager = pick(asyncHooks, 'AsyncLocalStorageContextManager');

    // Needed so child spans (steps, LLM calls) nest under the request span.
    // Returns false and keeps the existing manager if one is already set.
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

    const exporter = new OTLPTraceExporter({
      url: config.endpoint,
      // Arize's OTLP/HTTP endpoint expects the hyphenated header names.
      headers: {
        'arize-space-id': config.spaceId,
        'arize-api-key': config.apiKey,
      },
    });

    const provider = new TracerProvider({
      resource: resourceFromAttributes({
        'service.name': config.projectName,
        [ATTR.PROJECT_NAME]: config.projectName,
        'deployment.environment.name': process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      }),
      spanProcessors: [new BatchSpanProcessor({ exporter })],
    });

    console.log(`[tracing] Arize AX tracing enabled (project: ${config.projectName})`);
    return { provider, tracer: provider.getTracer('fincast') };
  } catch (error) {
    console.warn(`[tracing] Arize AX tracing disabled: ${error?.message || error}`);
    return null;
  }
}

function getState() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = initTracing();
  }
  return globalThis[STATE_KEY];
}

// Tracing must never break a request, so attribute writes are best-effort.
function safely(fn) {
  try {
    return fn();
  } catch (error) {
    console.warn(`[tracing] ${error?.message || error}`);
    return undefined;
  }
}

function toText(value) {
  if (value == null) return undefined;
  let text;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  if (typeof text !== 'string') return undefined;
  return text.length > MAX_ATTRIBUTE_CHARS
    ? `${text.slice(0, MAX_ATTRIBUTE_CHARS)}…[truncated]`
    : text;
}

function setValue(span, valueKey, mimeKey, value) {
  const text = toText(value);
  if (text === undefined) return;
  span.setAttribute(valueKey, text);
  span.setAttribute(mimeKey, typeof value === 'string' ? 'text/plain' : 'application/json');
}

function setAttributes(span, attributes) {
  if (!attributes) return;
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) continue;
    const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value);
    const isPrimitiveArray = Array.isArray(value) && value.every((item) => typeof item === 'string');
    span.setAttribute(key, isPrimitive || isPrimitiveArray ? value : toText(value));
  }
}

function mergeMetadata(span, metadata) {
  if (!metadata) return;
  const merged = { ...(spanMetadata.get(span) || {}), ...metadata };
  spanMetadata.set(span, merged);
  span.setAttribute(ATTR.METADATA, toText(merged));
}

function applyOptions(span, { input, output, attributes, metadata, tags } = {}) {
  safely(() => {
    if (input !== undefined) setValue(span, ATTR.INPUT_VALUE, ATTR.INPUT_MIME_TYPE, input);
    if (output !== undefined) setValue(span, ATTR.OUTPUT_VALUE, ATTR.OUTPUT_MIME_TYPE, output);
    setAttributes(span, attributes);
    mergeMetadata(span, metadata);
    if (Array.isArray(tags) && tags.length > 0) span.setAttribute(ATTR.TAGS, tags.map(String));
  });
}

function markError(span, message) {
  safely(() => {
    erroredSpans.add(span);
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(message || 'error') });
  });
}

function recordError(span, error) {
  safely(() => {
    span.recordException(error instanceof Error ? error : new Error(String(error)));
  });
  markError(span, error?.message || error);
}

function runSpan(state, name, options, fn) {
  return state.tracer.startActiveSpan(name, async (span) => {
    try {
      safely(() => span.setAttribute(ATTR.SPAN_KIND, options?.kind || 'CHAIN'));
      applyOptions(span, options);
      const result = await fn(span);
      if (!erroredSpans.has(span)) {
        safely(() => span.setStatus({ code: SpanStatusCode.OK }));
      }
      return result;
    } catch (error) {
      recordError(span, error);
      throw error;
    } finally {
      safely(() => span.end());
    }
  });
}

async function flush(state) {
  let timer;
  try {
    await Promise.race([
      state.provider.forceFlush({ timeoutMillis: FLUSH_TIMEOUT_MS }),
      new Promise((resolve) => {
        timer = setTimeout(resolve, FLUSH_TIMEOUT_MS + 500);
      }),
    ]);
  } catch (error) {
    console.warn(`[tracing] Failed to flush spans to Arize: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

function messageText(content) {
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || '').join('');
  }
  return typeof content === 'string' ? content : toText(content) || '';
}

function setLLMInput(span, body, provider) {
  safely(() => {
    span.setAttribute(ATTR.SPAN_KIND, 'LLM');
    span.setAttribute(ATTR.LLM_PROVIDER, provider);
    if (body?.model) span.setAttribute(ATTR.LLM_MODEL_NAME, body.model);

    const { messages, model, ...invocationParameters } = body || {};
    span.setAttribute(ATTR.LLM_INVOCATION_PARAMETERS, toText(invocationParameters));
    setValue(span, ATTR.INPUT_VALUE, ATTR.INPUT_MIME_TYPE, { model, messages });

    (Array.isArray(messages) ? messages : []).forEach((message, index) => {
      const prefix = `${ATTR.LLM_INPUT_MESSAGES}.${index}.message`;
      span.setAttribute(`${prefix}.role`, String(message?.role || 'user'));
      span.setAttribute(`${prefix}.content`, toText(messageText(message?.content)) || '');
    });
  });
}

function setLLMOutput(span, data) {
  safely(() => {
    if (!data || typeof data !== 'object') return;

    // OpenRouter reports the model that actually served the request.
    if (typeof data.model === 'string' && data.model) {
      span.setAttribute(ATTR.LLM_MODEL_NAME, data.model);
    }

    const message = data.choices?.[0]?.message;
    if (message) {
      const text = messageText(message.content);
      const prefix = `${ATTR.LLM_OUTPUT_MESSAGES}.0.message`;
      span.setAttribute(`${prefix}.role`, String(message.role || 'assistant'));
      span.setAttribute(`${prefix}.content`, toText(text) || '');
      setValue(span, ATTR.OUTPUT_VALUE, ATTR.OUTPUT_MIME_TYPE, text);
    }

    const usage = data.usage || {};
    if (Number.isFinite(usage.prompt_tokens)) span.setAttribute(ATTR.LLM_TOKEN_COUNT_PROMPT, usage.prompt_tokens);
    if (Number.isFinite(usage.completion_tokens)) span.setAttribute(ATTR.LLM_TOKEN_COUNT_COMPLETION, usage.completion_tokens);
    if (Number.isFinite(usage.total_tokens)) span.setAttribute(ATTR.LLM_TOKEN_COUNT_TOTAL, usage.total_tokens);
    if (Number.isFinite(usage.cost)) span.setAttribute(ATTR.LLM_COST_TOTAL, usage.cost);

    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason) span.setAttribute('llm.finish_reason', String(finishReason));

    // Perplexity Sonar returns the URLs it grounded the answer on.
    if (Array.isArray(data.citations) && data.citations.length > 0) {
      span.setAttribute('fincast.citations', data.citations.map(String));
    }
  });
}

/**
 * Run `fn` inside a span that is a child of the current active span.
 *
 * @param {string} name
 * @param {{ kind?: 'CHAIN'|'AGENT'|'TOOL'|'RETRIEVER', input?: any, attributes?: object, metadata?: object, tags?: string[] }} options
 * @param {() => Promise<any>} fn
 */
export async function withSpan(name, options, fn) {
  const state = await getState();
  if (!state) return fn();
  return runSpan(state, name, options, fn);
}

/**
 * Root span for an API route. Marks 5xx responses as errors and flushes
 * spans to Arize before the serverless function returns.
 */
export async function traceRequest(name, options, fn) {
  const state = await getState();
  if (!state) return fn();

  try {
    return await runSpan(state, name, options, async (span) => {
      const response = await fn();
      const status = response?.status;
      if (typeof status === 'number') {
        safely(() => span.setAttribute('http.response.status_code', status));
        if (status >= 400 && typeof response.clone === 'function') {
          const payload = await response.clone().json().catch(() => null);
          const message = payload?.error || `HTTP ${status}`;
          applyOptions(span, { output: payload ?? message });
          if (status >= 500) markError(span, message);
        }
      }
      return response;
    });
  } finally {
    await flush(state);
  }
}

/**
 * Trace one chat-completion call. `body` is the OpenAI-style request body;
 * `fn` performs the request and must return the parsed completion JSON (or
 * throw). Token counts, the answer and the serving model are read off it.
 *
 * @param {{ name?: string, provider?: string, body: object, metadata?: object }} options
 * @param {() => Promise<any>} fn
 */
export async function traceLLMCall({ name = 'openrouter.chat', provider = 'openrouter', body, metadata }, fn) {
  const state = await getState();
  if (!state) return fn();

  return state.tracer.startActiveSpan(name, async (span) => {
    try {
      setLLMInput(span, body, provider);
      safely(() => mergeMetadata(span, { requested_model: body?.model, ...metadata }));
      const data = await fn();
      setLLMOutput(span, data);
      safely(() => span.setStatus({ code: SpanStatusCode.OK }));
      return data;
    } catch (error) {
      recordError(span, error);
      throw error;
    } finally {
      safely(() => span.end());
    }
  });
}

/**
 * Add input/output/attributes/metadata to the current active span.
 * No-op when tracing is disabled or no span is active.
 */
export function annotateSpan(options) {
  const span = safely(() => trace.getActiveSpan());
  if (!span) return;
  applyOptions(span, options);
}

/** Compact, trace-friendly view of a valuation response. */
export function summarizeValuation(valuation) {
  if (!valuation || typeof valuation !== 'object') return valuation ?? null;
  return {
    companyName: valuation.companyName,
    method: valuation.method,
    source: valuation.source,
    fairValue: valuation.fairValue,
    currentSharePrice: valuation.currentSharePrice,
    upside: valuation.upside,
    cagr: valuation.cagr,
    exitMultipleType: valuation.exitMultipleType,
    exitMultipleValue: valuation.exitMultipleValue,
    discountRate: valuation.discountRate,
    terminalGrowth: valuation.terminalGrowth,
    projections: Array.isArray(valuation.projections)
      ? valuation.projections.map((p) => ({
        year: p?.year,
        revenue: p?.revenue,
        revenueGrowth: p?.revenueGrowth,
        grossMargin: p?.grossMargin,
        ebitdaMargin: p?.ebitdaMargin,
        fcfMargin: p?.fcfMargin,
        netIncome: p?.netIncome,
        eps: p?.eps,
      }))
      : undefined,
    confidence_scores: valuation.confidence_scores,
    validation_issues: valuation.validation_issues,
    llm_calls: valuation.llm_calls,
    web_searches: valuation.web_searches,
    total_cost: valuation.total_cost,
    total_time_seconds: valuation.total_time_seconds,
  };
}
