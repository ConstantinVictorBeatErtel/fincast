# Arize Phoenix Integration

Fincast now includes [Arize Phoenix](https://docs.arize.com/phoenix) for LLM observability and tracing. Phoenix provides comprehensive monitoring, debugging, and evaluation capabilities for your OpenRouter LLM calls.

## Features

- **Automatic Tracing**: All OpenRouter API calls are automatically traced with detailed spans
- **Token Usage Tracking**: Monitor prompt tokens, completion tokens, and total tokens per request
- **Performance Monitoring**: Track latency, errors, and throughput of LLM calls
- **Request/Response Logging**: Capture input prompts and model outputs for debugging
- **Cost Tracking**: Monitor LLM usage costs (when provided by OpenRouter)
- **Visual UI**: Phoenix provides a beautiful web UI for exploring traces

## Quick Start

### 1. Install Phoenix Server (Local Development)

The easiest way to run Phoenix locally is using Docker:

```bash
docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
```

Or install via pip and run:

```bash
pip install arize-phoenix
python -m phoenix.server.main serve
```

The Phoenix UI will be available at: **http://localhost:6006**

### 2. Configure Environment Variables

Copy the Phoenix configuration from `env.example` to your `.env` file:

```bash
# Arize Phoenix - LLM Observability
PHOENIX_ENABLED="true"
PHOENIX_COLLECTOR_ENDPOINT="http://localhost:6006/v1/traces"
PHOENIX_SERVICE_NAME="fincast"
PHOENIX_DEBUG="false"
PHOENIX_AUTO_INIT="false"
```

### 3. Install Dependencies

Node.js dependencies are already installed. For Python services (optional):

```bash
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Start Your Application

```bash
npm run dev
```

Phoenix tracing is automatically initialized when the DCF valuation API is loaded.

## Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PHOENIX_ENABLED` | `true` | Enable/disable Phoenix tracing |
| `PHOENIX_COLLECTOR_ENDPOINT` | `http://localhost:6006/v1/traces` | Phoenix collector endpoint |
| `PHOENIX_SERVICE_NAME` | `fincast` | Service name shown in traces |
| `PHOENIX_DEBUG` | `false` | Enable debug logging |
| `PHOENIX_AUTO_INIT` | `false` | Auto-initialize on module load |

## What Gets Traced

Phoenix automatically captures:

### Request Information
- Model name (e.g., `x-ai/grok-code-fast-1`)
- Input messages and prompts (truncated to 1000 chars)
- Temperature and max_tokens parameters
- Request timestamp

### Response Information
- Model response content (truncated to 1000 chars)
- Token usage (prompt, completion, total)
- Finish reason (e.g., `stop`, `length`)
- Response latency
- Cost information (if available)

### Error Information
- Error type and message
- Full stack traces
- HTTP status codes

## Viewing Traces

1. Open Phoenix UI at **http://localhost:6006**
2. You'll see all LLM requests in real-time
3. Click on any trace to see detailed spans
4. Analyze patterns, errors, and performance metrics

### Key Metrics to Monitor

- **Latency**: How long LLM calls take
- **Token Usage**: Cost optimization opportunities
- **Error Rate**: Failed requests and reasons
- **Model Performance**: Compare different models (Grok, GPT-4o-mini, etc.)

## Production Deployment

### Using Phoenix Cloud

For production, consider using [Phoenix Cloud](https://app.phoenix.arize.com):

1. Sign up for a Phoenix Cloud account
2. Get your API key
3. Update environment variables:

```bash
PHOENIX_COLLECTOR_ENDPOINT="https://app.phoenix.arize.com/v1/traces"
PHOENIX_API_KEY="your-api-key-here"
```

### Self-Hosted Phoenix

Deploy Phoenix server on your infrastructure:

```bash
# Docker Compose example
version: '3'
services:
  phoenix:
    image: arizephoenix/phoenix:latest
    ports:
      - "6006:6006"
      - "4317:4317"
    environment:
      - PHOENIX_WORKING_DIR=/data
    volumes:
      - phoenix-data:/data

volumes:
  phoenix-data:
```

## Python Services Integration (Optional)

If you want to trace Python services (e.g., FastAPI endpoints), use the Python instrumentation:

```python
from lib.phoenix_python import initialize_phoenix, get_tracer

# Initialize Phoenix
initialize_phoenix()

# Create custom spans
tracer = get_tracer("my-python-service")

with tracer.start_as_current_span("my_operation") as span:
    span.set_attribute("custom.attribute", "value")
    # Your code here
```

## Disabling Phoenix

To disable Phoenix tracing:

```bash
# In .env
PHOENIX_ENABLED="false"
```

Or remove the initialization from `app/api/dcf-valuation/route.js`.

## Troubleshooting

### Phoenix UI Not Showing Traces

1. Check Phoenix server is running: `curl http://localhost:6006/healthz`
2. Verify `PHOENIX_ENABLED="true"` in your `.env`
3. Check console for `[Phoenix]` initialization logs
4. Enable debug mode: `PHOENIX_DEBUG="true"`

### High Memory Usage

Phoenix stores traces in memory by default. For production:
- Use Phoenix Cloud for unlimited storage
- Configure data retention policies
- Use sampling for high-traffic applications

### CORS Issues

If accessing Phoenix UI from a different domain, configure CORS in Phoenix server.

## Advanced Usage

### Custom Spans

Add custom spans for your own operations:

```javascript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('fincast');

async function myCustomOperation() {
  return await tracer.startActiveSpan('custom_operation', async (span) => {
    try {
      span.setAttribute('custom.attribute', 'value');
      // Your code here
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
    } finally {
      span.end();
    }
  });
}
```

### Filtering Sensitive Data

Modify `lib/phoenix-openrouter.js` to filter sensitive information:

```javascript
// Example: Remove PII from prompts
'llm.input_messages': JSON.stringify(messages.map((msg) => ({
  role: msg.role,
  content: filterPII(msg.content), // Your PII filter
})))
```

## Resources

- [Phoenix Documentation](https://docs.arize.com/phoenix)
- [OpenTelemetry JS Docs](https://opentelemetry.io/docs/instrumentation/js/)
- [Phoenix GitHub](https://github.com/Arize-ai/phoenix)
- [Phoenix Discord Community](https://discord.gg/arize)

## Support

For issues specific to Phoenix integration in Fincast, please open an issue on the Fincast repository.

For Phoenix-related questions, visit the [Phoenix documentation](https://docs.arize.com/phoenix) or join their Discord community.
