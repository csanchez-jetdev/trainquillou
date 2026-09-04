import pytest

from tgvmax import throttle


@pytest.fixture(autouse=True)
def small_budget(monkeypatch):
    """Three units per window, so a test does not have to send sixty requests."""
    monkeypatch.setattr(throttle, "BUDGET", 3)
    monkeypatch.setattr(throttle, "COST", {"/api/health": 1})


@pytest.mark.django_db
def test_budget_exhaustion_returns_429_with_retry_after(client):
    for _ in range(3):
        assert client.get("/api/health", REMOTE_ADDR="10.0.0.1").status_code == 200

    refused = client.get("/api/health", REMOTE_ADDR="10.0.0.1")
    assert refused.status_code == 429
    assert 1 <= int(refused["Retry-After"]) <= throttle.WINDOW_SECONDS


@pytest.mark.django_db
def test_each_address_gets_its_own_budget(client):
    for _ in range(4):
        client.get("/api/health", REMOTE_ADDR="10.0.0.2")

    assert client.get("/api/health", REMOTE_ADDR="10.0.0.3").status_code == 200


@pytest.mark.django_db
def test_forwarded_header_wins_over_the_socket_address(client):
    """What the proxy declares is what counts: it is where the real client address survives."""
    for _ in range(4):
        client.get("/api/health", REMOTE_ADDR="10.0.0.4", HTTP_X_FORWARDED_FOR="203.0.113.7")

    refused = client.get("/api/health", REMOTE_ADDR="10.0.0.5", HTTP_X_FORWARDED_FOR="203.0.113.7")
    assert refused.status_code == 429


def test_paths_outside_the_api_are_not_counted(client):
    for _ in range(10):
        # 404 is fine: what matters is that the throttle let it through.
        assert client.get("/robots.txt", REMOTE_ADDR="10.0.0.6").status_code == 404
