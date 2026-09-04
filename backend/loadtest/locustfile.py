# Parameters are read from the instance under test, so a run measures the service instead
# of collecting refusals when the bookable window moves.

import os
import random
from datetime import date as Date
from datetime import timedelta

import requests
from locust import HttpUser, between, events, task

# One address would exhaust the 300-units-a-minute budget (tgvmax.throttle) in seconds.
SPOOF_IP = os.environ.get("TRAINQUILLOU_SPOOF_IP", "1").lower() not in {"0", "false", "no"}

LABELS: list[str] = []
DAYS: list[str] = []


@events.test_start.add_listener
def read_parameters(environment, **_):
    host = (environment.host or "http://localhost:8000").rstrip("/")
    LABELS[:] = requests.get(f"{host}/api/stations", timeout=30).json()
    snapshot = requests.get(f"{host}/api/stats", timeout=60)
    DAYS[:] = [day["date"] for day in snapshot.json()["daily"]] if snapshot.ok else []
    if not DAYS:
        today = Date.today()
        DAYS[:] = [(today + timedelta(days=offset)).isoformat() for offset in range(30)]
        print("no snapshot: dates guessed, expect refusals past the bookable horizon")
    if not LABELS:
        raise RuntimeError("/api/stations answered an empty list: nothing to search")


class Visitor(HttpUser):
    wait_time = between(1, 5)

    def on_start(self):
        if SPOOF_IP:
            octets = (random.randrange(256), random.randrange(256), random.randrange(1, 255))
            self.client.headers["X-Forwarded-For"] = "10." + ".".join(str(o) for o in octets)
        self.origin = random.choice(LABELS)
        self.destinations: list[str] = []
        self.client.get("/api/updated")

    def _pair(self) -> tuple[str, str] | None:
        """The origin last searched and one of its destinations, or nothing yet."""
        if not self.destinations:
            return None
        return self.origin, random.choice(self.destinations)

    @task(10)
    def search(self):
        self.origin = random.choice(LABELS)
        with self.client.get(
            "/api/search",
            params={"origin": self.origin, "date": random.choice(DAYS)},
            name="/api/search",
            catch_response=True,
        ) as response:
            if response.ok:
                self.destinations = [d["label"] for d in response.json()["destinations"]]

    @task(2)
    def search_window(self):
        first, last = sorted(random.sample(DAYS, 2))
        self.client.get(
            "/api/search",
            params={
                "origin": random.choice(LABELS),
                "date": first,
                "dateTo": last,
                "mode": random.choice(["range", "roundtrip"]),
            },
            name="/api/search?mode=range|roundtrip",
        )

    @task(4)
    def itinerary(self):
        pair = self._pair()
        if pair is None:
            return
        origin, destination = pair
        self.client.get(
            "/api/route",
            params={"from": origin, "to": destination, "date": random.choice(DAYS), "stops": 2},
            name="/api/route",
        )

    @task(3)
    def returns(self):
        pair = self._pair()
        if pair is None:
            return
        origin, destination = pair
        self.client.get(
            "/api/returns",
            params={"origin": origin, "dest": destination, "from": min(DAYS)},
            name="/api/returns",
        )

    @task(2)
    def autocomplete(self):
        self.client.get("/api/stations")

    @task(1)
    def statistics(self):
        # Scoped only to a station the last search found offers for: the route answers 503
        # for one that has none, which would count as a failure.
        scoped = self.destinations and random.random() < 0.5
        params = {"origin": self.origin} if scoped else {}
        self.client.get("/api/stats", params=params, name="/api/stats")

    @task(1)
    def multileg(self):
        if len(self.destinations) < 2:
            return
        stops = [self.origin, *random.sample(self.destinations, 2)]
        first, last = sorted(random.sample(DAYS, 2))
        self.client.get(
            "/api/multileg",
            params={"stops": "|".join(stops), "date": first, "dateTo": last, "minStay": 2},
            name="/api/multileg",
        )
