/**
 * Phoenix Instrumentation for OpenRouter
 *
 * This module provides OpenTelemetry tracing for OpenRouter API calls.
 * It creates spans for each LLM request with detailed attributes.
 */

import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import {
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_URL,
  SEMATTRS_HTTP_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';

// Get tracer
const tracer = trace.getTracer('openrouter-instrumentation', '1.0.0');

/**
 * Trace an OpenRouter API request
 * @param {Object} requestBody - The request body sent to OpenRouter
 * @param {Function} requestFn - The function that makes the actual HTTP request
 * @returns {Promise} - The response from OpenRouter
 */
export async function traceOpenRouterRequest(requestBody, requestFn) {
  const phoenixEnabled = process.env.PHOENIX_ENABLED !== 'false';

  // If Phoenix is disabled, just execute the request
  if (!phoenixEnabled) {
    return await requestFn();
  }

  // Extract key information from the request
  const model = requestBody.model || 'unknown';
  const messages = requestBody.messages || [];
  const temperature = requestBody.temperature || 0.7;
  const maxTokens = requestBody.max_tokens || null;

  // Create a span for this LLM request
  return await tracer.startActiveSpan(
    `openrouter.chat.completions.${model}`,
    {
      kind: 1, // SpanKind.CLIENT
      attributes: {
        // HTTP attributes
        [SEMATTRS_HTTP_METHOD]: 'POST',
        [SEMATTRS_HTTP_URL]: 'https://openrouter.ai/api/v1/chat/completions',

        // LLM attributes (OpenInference conventions)
        'llm.vendor': 'openrouter',
        'llm.request.model': model,
        'llm.request.type': 'chat',
        'llm.request.temperature': temperature,
        'llm.request.max_tokens': maxTokens || 0,
        'llm.input_messages.count': messages.length,

        // Add message content (be careful with PII)
        'llm.input_messages': JSON.stringify(messages.map((msg, idx) => ({
          role: msg.role,
          content: typeof msg.content === 'string'
            ? msg.content.substring(0, 1000) // Limit to first 1000 chars
            : '[complex content]',
          index: idx,
        }))),

        // Application context
        'fincast.service': 'dcf-valuation',
      },
    },
    async (span) => {
      const startTime = Date.now();

      try {
        // Execute the actual request
        const response = await requestFn();
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Extract response details
        const completion = response?.choices?.[0]?.message?.content || '';
        const usage = response?.usage || {};
        const finishReason = response?.choices?.[0]?.finish_reason || 'unknown';

        // Add response attributes to the span
        span.setAttributes({
          [SEMATTRS_HTTP_STATUS_CODE]: 200,

          // LLM response attributes
          'llm.response.model': response?.model || model,
          'llm.response.finish_reason': finishReason,
          'llm.usage.prompt_tokens': usage.prompt_tokens || 0,
          'llm.usage.completion_tokens': usage.completion_tokens || 0,
          'llm.usage.total_tokens': usage.total_tokens || 0,
          'llm.response.duration_ms': duration,

          // Add completion content (truncated)
          'llm.output_messages': JSON.stringify([{
            role: 'assistant',
            content: completion.substring(0, 1000), // Limit to first 1000 chars
          }]),

          // Cost estimation (if available from OpenRouter)
          'llm.usage.cost': usage.cost || 0,
        });

        // Mark span as successful
        span.setStatus({ code: SpanStatusCode.OK });

        return response;
      } catch (error) {
        // Record the error
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });

        // Add error attributes
        span.setAttributes({
          'error': true,
          'error.type': error.name,
          'error.message': error.message,
          'error.stack': error.stack,
        });

        // Re-throw the error
        throw error;
      } finally {
        // End the span
        span.end();
      }
    }
  );
}

/**
 * Wrap an existing OpenRouter request function with tracing
 * @param {Function} makeRequestFn - The original request function
 * @returns {Function} - A wrapped version with tracing
 */
export function wrapOpenRouterRequest(makeRequestFn) {
  return async (requestBody, ...args) => {
    return await traceOpenRouterRequest(
      requestBody,
      async () => await makeRequestFn(requestBody, ...args)
    );
  };
}

export default {
  traceOpenRouterRequest,
  wrapOpenRouterRequest,
};
