from datetime import date

import pytest

from tgvmax import catalog

# Every fixture below sits in August 2026: read from the real clock, the bookable window would
# close behind them and each windowed endpoint would answer 503.
FROZEN_TODAY = date(2026, 8, 1)


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch):
    monkeypatch.setattr(catalog, "today", lambda: FROZEN_TODAY)
