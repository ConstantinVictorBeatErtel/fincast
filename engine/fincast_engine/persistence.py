"""Optional asyncpg persistence for the separate ``engine`` schema."""

from __future__ import annotations

from typing import Any


ENGINE_SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS engine;

CREATE TABLE IF NOT EXISTS engine.financial_periods (
  id BIGSERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  fiscal_quarter INT,
  period_end_date DATE NOT NULL,
  line_item TEXT NOT NULL,
  value NUMERIC NOT NULL,
  segment_id TEXT,
  source_filing_id TEXT,
  restated_from_id BIGINT,
  UNIQUE (company_id, fiscal_year, fiscal_quarter, line_item, segment_id)
);

CREATE TABLE IF NOT EXISTS engine.extracted_drivers (
  id BIGSERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  period_end_date DATE NOT NULL,
  segment_id TEXT,
  driver_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  UNIQUE (company_id, period_end_date, driver_name, segment_id)
);

CREATE TABLE IF NOT EXISTS engine.forecast_runs (
  id UUID PRIMARY KEY,
  company_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  head TEXT NOT NULL,
  status TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  total_cost_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engine.node_results (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES engine.forecast_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence TEXT NOT NULL,
  used_fallback BOOLEAN NOT NULL DEFAULT false,
  retry_count INT NOT NULL DEFAULT 0,
  critic_verdict JSONB,
  cited_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (run_id, node_id)
);

CREATE TABLE IF NOT EXISTS engine.research_cache (
  cache_key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS engine.llm_calls (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES engine.forecast_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  cached_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


class AsyncpgRepository:
    """Small persistence adapter; importing asyncpg is deferred until use."""

    def __init__(self, pool: Any) -> None:
        self.pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "AsyncpgRepository":
        try:
            import asyncpg
        except ImportError as exc:
            raise RuntimeError("Install asyncpg to use Postgres persistence") from exc
        pool = await asyncpg.create_pool(dsn)
        repository = cls(pool)
        await repository.initialise()
        return repository

    async def initialise(self) -> None:
        async with self.pool.acquire() as connection:
            await connection.execute(ENGINE_SCHEMA_SQL)

    async def get_cache(self, cache_key: str) -> Any | None:
        async with self.pool.acquire() as connection:
            row = await connection.fetchrow(
                "UPDATE engine.research_cache SET hit_count = hit_count + 1 WHERE cache_key = $1 RETURNING value",
                cache_key,
            )
        return row["value"] if row else None

    async def get(self, cache_key: str) -> Any | None:
        return await self.get_cache(cache_key)

    async def set_cache(self, cache_key: str, value: Any) -> None:
        async with self.pool.acquire() as connection:
            await connection.execute(
                """INSERT INTO engine.research_cache (cache_key, value) VALUES ($1, $2::jsonb)
                   ON CONFLICT (cache_key) DO UPDATE SET value = EXCLUDED.value""",
                cache_key,
                __import__("json").dumps(value),
            )

    async def set(self, cache_key: str, value: Any) -> None:
        await self.set_cache(cache_key, value)
