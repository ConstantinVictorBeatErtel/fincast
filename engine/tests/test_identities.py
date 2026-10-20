import pytest

from engine.fincast_engine.identities import compose


def test_compose_uses_accounting_identities():
    result = compose(
        {
            "revenue_growth": [0.0, 0.10],
            "gross_margin_pct": [0.40, 0.40],
            "opex_pct": [0.20, 0.20],
            "tax_rate": [0.20, 0.20],
            "da_pct": [0.05, 0.05],
            "capex_pct": [0.04, 0.04],
            "dso": [36.5, 36.5],
            "dio": [36.5, 36.5],
            "dpo": [48.6666667, 48.6666667],
        },
        starting_revenue=100.0,
        previous_nwc=8.0,
    )
    assert result["revenue"] == pytest.approx([100.0, 110.0])
    assert result["gross_profit"] == pytest.approx([40.0, 44.0])
    assert result["fcf"][0] == pytest.approx(7.0)
    assert result["delta_nwc"][1] == pytest.approx(0.8)
