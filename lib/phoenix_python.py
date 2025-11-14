"""
Arize Phoenix Configuration for Python Services

This module sets up OpenTelemetry instrumentation for LLM observability
using Arize Phoenix in Python services. It can be used to trace any
LLM calls made from Python scripts or FastAPI services.
"""

import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.requests import RequestsInstrumentor

_initialized = False
_tracer_provider = None


def initialize_phoenix(
    endpoint: str = None,
    service_name: str = None,
    debug: bool = False
):
    """
    Initialize Phoenix tracing for Python services.

    Args:
        endpoint: Phoenix collector endpoint (default: http://localhost:6006/v1/traces)
        service_name: Service name for traces (default: fincast-python)
        debug: Enable debug logging (default: False)

    Returns:
        TracerProvider instance or None if disabled
    """
    global _initialized, _tracer_provider

    # Skip initialization if already initialized or disabled
    if _initialized:
        print("[Phoenix] Already initialized, skipping...")
        return _tracer_provider

    phoenix_enabled = os.getenv("PHOENIX_ENABLED", "true").lower() != "false"
    if not phoenix_enabled:
        print("[Phoenix] Tracing disabled via PHOENIX_ENABLED=false")
        return None

    try:
        # Get configuration from environment or parameters
        endpoint = endpoint or os.getenv(
            "PHOENIX_COLLECTOR_ENDPOINT",
            "http://localhost:6006/v1/traces"
        )
        service_name = service_name or os.getenv(
            "PHOENIX_SERVICE_NAME",
            "fincast-python"
        )
        debug = debug or os.getenv("PHOENIX_DEBUG", "false").lower() == "true"

        print(f"[Phoenix] Initializing tracing...")
        print(f"[Phoenix] Endpoint: {endpoint}")
        print(f"[Phoenix] Service: {service_name}")

        # Create resource with service name
        resource = Resource.create(
            {
                "service.name": service_name,
                "service.version": "1.0.0",
            }
        )

        # Create tracer provider
        _tracer_provider = TracerProvider(resource=resource)

        # Create OTLP exporter
        otlp_exporter = OTLPSpanExporter(endpoint=endpoint)

        # Add span processor
        span_processor = BatchSpanProcessor(otlp_exporter)
        _tracer_provider.add_span_processor(span_processor)

        # Set global tracer provider
        trace.set_tracer_provider(_tracer_provider)

        # Instrument HTTP requests
        RequestsInstrumentor().instrument()

        _initialized = True

        print("[Phoenix] Tracing initialized successfully")
        print("[Phoenix] View traces at http://localhost:6006")

        return _tracer_provider

    except Exception as e:
        print(f"[Phoenix] Failed to initialize tracing: {e}")
        return None


def shutdown_phoenix():
    """Shutdown Phoenix tracing."""
    global _initialized, _tracer_provider

    if _tracer_provider and _initialized:
        try:
            _tracer_provider.shutdown()
            print("[Phoenix] Tracing shut down successfully")
            _initialized = False
        except Exception as e:
            print(f"[Phoenix] Error shutting down tracing: {e}")


def is_phoenix_initialized() -> bool:
    """Check if Phoenix is initialized."""
    return _initialized


def get_tracer(name: str = "fincast-python"):
    """
    Get a tracer instance for creating custom spans.

    Args:
        name: Name of the tracer

    Returns:
        Tracer instance
    """
    return trace.get_tracer(name)


# Auto-initialize if PHOENIX_AUTO_INIT is true
if os.getenv("PHOENIX_AUTO_INIT", "false").lower() == "true":
    initialize_phoenix()
