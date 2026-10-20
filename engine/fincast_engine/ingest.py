"""Thin adapters from existing financial payloads into canonical periods.

This module intentionally does not fetch filings.  The app already has Yahoo
and SEC fallback paths; callers pass their normalised output here.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from .schema import FinancialPeriod, LineItem, as_float


LINE_ITEM_ALIASES = {
    "totalRevenue": "revenue",
    "revenue": "revenue",
    "grossProfit": "gross_profit",
    "gross_profit": "gross_profit",
    "operatingIncome": "ebit",
    "operating_income": "ebit",
    "netIncome": "nopat",
    "net_income": "nopat",
    "depreciationAndAmortization": "d_and_a",
    "depreciation": "d_and_a",
    "capitalExpenditures": "capex",
    "capital_expenditures": "capex",
    "freeCashFlow": "fcf",
    "free_cash_flow": "fcf",
    "accountsReceivable": "receivables",
    "accounts_receivable": "receivables",
    "inventory": "inventory",
    "accountsPayable": "payables",
    "accounts_payable": "payables",
}


def canonical_line_item(value: Any) -> str:
    return LINE_ITEM_ALIASES.get(str(value), str(value))


def _period_date(record: Mapping[str, Any]) -> date:
    period = record.get("period_end_date") or record.get("period")
    if period is not None:
        return period if isinstance(period, date) else date.fromisoformat(str(period))
    if record.get("fiscal_year"):
        return date(int(record["fiscal_year"]), 12, 31)
    raise ValueError("a period_end_date, period, or fiscal_year is required")


def from_records(records: Iterable[Mapping[str, Any] | FinancialPeriod]) -> list[FinancialPeriod]:
    result: list[FinancialPeriod] = []
    for record in records:
        if isinstance(record, FinancialPeriod):
            result.append(record)
            continue
        period_date = _period_date(record)
        company_id = str(record.get("company_id") or record.get("ticker") or "unknown")
        fiscal_year = int(record.get("fiscal_year") or period_date.year)
        fiscal_quarter = record.get("fiscal_quarter")
        line_item = canonical_line_item(record["line_item"])
        result.append(
            FinancialPeriod(
                company_id=company_id,
                fiscal_year=fiscal_year,
                fiscal_quarter=int(fiscal_quarter) if fiscal_quarter is not None else None,
                period_end_date=period_date,
                line_item=line_item,
                value=as_float(record.get("value")),
                segment_id=record.get("segment_id"),
                source_filing_id=record.get("source_filing_id"),
                restated_from_id=record.get("restated_from_id"),
            )
        )
    return sorted(result, key=lambda item: (item.period_end_date, str(item.line_item), item.segment_id or ""))


def from_statement_periods(
    company_id: str,
    periods: Iterable[Mapping[str, Any]],
    *,
    source_filing_id: str | None = None,
) -> list[FinancialPeriod]:
    """Flatten ``{period: {line_item: value}}`` payloads from existing fetchers."""

    records: list[dict[str, Any]] = []
    for period in periods:
        period_end = period.get("period_end_date") or period.get("period") or date(int(period["fiscal_year"]), 12, 31).isoformat()
        for line_item, value in period.items():
            if line_item in {"period", "period_end_date", "fiscal_year", "fiscal_quarter"}:
                continue
            records.append(
                {
                    "company_id": company_id,
                    "period_end_date": period_end,
                    "fiscal_year": period.get("fiscal_year"),
                    "fiscal_quarter": period.get("fiscal_quarter"),
                    "line_item": canonical_line_item(line_item),
                    "value": value,
                    "source_filing_id": source_filing_id,
                }
            )
    return from_records(records)


def fetch_and_ingest(fetcher: Any, ticker: str) -> list[FinancialPeriod]:
    """Use an existing sync or async fetch function, without adding a scraper."""

    payload = fetcher(ticker)
    if hasattr(payload, "__await__"):
        raise TypeError("async fetchers must be awaited by the caller before ingesting")
    if isinstance(payload, Mapping) and "historical_financials" in payload:
        return from_statement_periods(ticker, payload["historical_financials"])
    if isinstance(payload, Mapping):
        return from_statement_periods(ticker, payload.get("periods", []))
    return from_records(payload)
