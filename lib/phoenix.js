/**
 * Arize Phoenix Configuration for Fincast
 *
 * This module sets up OpenTelemetry instrumentation for LLM observability
 * using Arize Phoenix. It traces all OpenRouter API calls made in the application.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

let sdk = null;
let isInitialized = false;

/**
 * Initialize Phoenix tracing
 * @param {Object} options - Configuration options
 * @param {string} options.phoenixEndpoint - Phoenix collector endpoint (default: http://localhost:6006)
 * @param {string} options.serviceName - Service name for traces (default: fincast)
 * @param {boolean} options.debug - Enable debug logging (default: false)
 */
export function initializePhoenix(options = {}) {
  // Skip initialization if already initialized or if explicitly disabled
  if (isInitialized) {
    console.log('[Phoenix] Already initialized, skipping...');
    return sdk;
  }

  const phoenixEnabled = process.env.PHOENIX_ENABLED !== 'false';
  if (!phoenixEnabled) {
    console.log('[Phoenix] Tracing disabled via PHOENIX_ENABLED=false');
    return null;
  }

  try {
    const phoenixEndpoint = options.phoenixEndpoint ||
                           process.env.PHOENIX_COLLECTOR_ENDPOINT ||
                           'http://localhost:6006/v1/traces';
    const serviceName = options.serviceName ||
                       process.env.PHOENIX_SERVICE_NAME ||
                       'fincast';
    const debug = options.debug || process.env.PHOENIX_DEBUG === 'true';

    // Enable debug logging if requested
    if (debug) {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    console.log(`[Phoenix] Initializing tracing...`);
    console.log(`[Phoenix] Endpoint: ${phoenixEndpoint}`);
    console.log(`[Phoenix] Service: ${serviceName}`);

    // Configure the trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: phoenixEndpoint,
      headers: {},
    });

    // Initialize the SDK
    sdk = new NodeSDK({
      serviceName: serviceName,
      traceExporter: traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable instrumentations we don't need
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
          '@opentelemetry/instrumentation-dns': {
            enabled: false,
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();
    isInitialized = true;

    console.log('[Phoenix] Tracing initialized successfully');
    console.log('[Phoenix] View traces at http://localhost:6006');

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => console.log('[Phoenix] Tracing terminated'))
        .catch((error) => console.error('[Phoenix] Error terminating tracing', error))
        .finally(() => process.exit(0));
    });

    return sdk;
  } catch (error) {
    console.error('[Phoenix] Failed to initialize tracing:', error);
    return null;
  }
}

/**
 * Shutdown Phoenix tracing
 */
export async function shutdownPhoenix() {
  if (sdk && isInitialized) {
    try {
      await sdk.shutdown();
      console.log('[Phoenix] Tracing shut down successfully');
      isInitialized = false;
    } catch (error) {
      console.error('[Phoenix] Error shutting down tracing:', error);
    }
  }
}

/**
 * Check if Phoenix is initialized
 */
export function isPhoenixInitialized() {
  return isInitialized;
}

// Auto-initialize if PHOENIX_AUTO_INIT is true
if (process.env.PHOENIX_AUTO_INIT === 'true') {
  initializePhoenix();
}

export default {
  initializePhoenix,
  shutdownPhoenix,
  isPhoenixInitialized,
};
