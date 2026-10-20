from datetime import date, timedelta

import pytest

from engine.fincast_engine.extract import from_history
from engine.fincast_engine.identities import compose, relative_error


def _sample_history(seed: float) -> list[dict[str, float | str]]:
    drivers = {
        "revenue_growth": [0.0, 0.08, 0.06, 0.05, 0.04],
        "gross_margin_pct": [0.40, 0.41, 0.42, 0.42, 0.43],
        "opex_pct": [0.22, 0.215, 0.21, 0.205, 0.20],
        "tax_rate": [0.21] * 5,
        "da_pct": [0.05] * 5,
        "capex_pct": [0.04] * 5,
        "dso": [45.0] * 5,
        "dio": [35.0] * 5,
        "dpo": [40.0] * 5,
    }
    statement = compose(drivers, starting_revenue=seed, previous_nwc=seed * 0.08)
    rows: list[dict[str, float | str]] = []
    for index in range(5):
        period = date(2021 + index, 12, 31).isoformat()
        rows.append({"period": period, **{line_item: values[index] for line_item, values in statement.items() if line_item != "segment_revenue_by_id"}})
    return rows


@pytest.mark.parametrize("seed", [100.0, 250.0, 1_000.0, 5_000.0, 25_000.0])
def test_historical_drivers_rebuild_reported_statements(seed: float):
    reported = _sample_history(seed)
    drivers = from_history(reported)
    rebuilt = compose(drivers, horizon=5, starting_revenue=drivers["starting_revenue"], previous_nwc=drivers["previous_nwc"])
    for line_item in ("revenue", "cogs", "gross_profit", "opex", "ebit", "nopat", "d_and_a", "capex", "receivables", "inventory", "payables", "nwc", "delta_nwc", "fcf"):
        for actual, expected in zip(rebuilt[line_item], (row[line_item] for row in reported)):
            assert relative_error(actual, expected) < 0.005, line_item

