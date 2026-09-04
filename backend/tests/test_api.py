"""End-to-end checks on the HTTP surface, one per behaviour the client depends on."""

from datetime import date, time

import pytest
from django.core.cache import cache

from tgvmax.models import Coverage, Offer, Station

PARIS = "PARIS (intramuros)"
LYON = "LYON (intramuros)"
MARSEILLE = "MARSEILLE ST CHARLES"
# The dataset really carries this one, with a broken encoding, duplicating "ANGOULEME".
MANGLED = "ANGOULA" + chr(0x8A) + "ME"

D1 = date(2026, 8, 10)
D2 = date(2026, 8, 11)


def offer(day, origin, destination, departure, arrival, train="1234"):
    # The ingestion records stations from a separate, unfiltered call; a fixture that only
    # created offers would leave the catalogue empty and every label unknown.
    for label in (origin, destination):
        Station.objects.get_or_create(label=label, defaults={"first_seen": day, "last_seen": day})
    return Offer.objects.create(
        date=day,
        train_no=train,
        origin=origin,
        destination=destination,
        departure=time.fromisoformat(departure),
        arrival=time.fromisoformat(arrival),
        bookable=True,
        first_seen=day,
        last_seen=day,
    )


@pytest.fixture
def network(db):
    offer(D1, PARIS, LYON, "08:00", "10:00", train="6601")
    offer(D1, PARIS, LYON, "12:00", "14:00", train="6602")
    offer(D1, LYON, MARSEILLE, "10:30", "12:10", train="5101")
    offer(D1, LYON, PARIS, "18:00", "20:00", train="6690")
    offer(D2, PARIS, LYON, "09:00", "11:00", train="6603")
    # Same city on both ends: a real train, not a destination.
    offer(D1, PARIS, PARIS, "07:00", "07:20", train="9999")
    offer(D1, MANGLED, PARIS, "06:00", "08:00", train="8888")


@pytest.mark.django_db
def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


@pytest.fixture(autouse=True)
def _no_cached_day():
    """`/updated` caches in process memory, which otherwise leaks between tests."""
    cache.clear()


@pytest.mark.django_db
def test_updated_dates_the_last_ingestion(client, network):
    assert client.get("/api/updated").json() == {
        "updatedOn": D1.isoformat(),
        "eligibleShare": None,
    }


@pytest.mark.django_db
def test_updated_carries_the_headline_share_so_the_landing_page_skips_the_snapshot(client, network):
    Coverage.objects.create(date=D1, axis="EST", total=200, eligible=50, observed_on=D1)
    Coverage.objects.create(date=D1, axis="NORD", total=200, eligible=30, observed_on=D1)

    assert client.get("/api/updated").json()["eligibleShare"] == 0.2


@pytest.mark.django_db
def test_updated_answers_without_data(client):
    assert client.get("/api/updated").json() == {"updatedOn": None, "eligibleShare": None}


@pytest.mark.django_db
def test_stations_are_sorted_and_exclude_the_mis_encoded_label(client, network):
    labels = client.get("/api/stations").json()

    assert labels == [LYON, MARSEILLE, PARIS]
    assert MANGLED not in labels


@pytest.mark.django_db
class TestSearch:
    def test_departures_from_a_station(self, client, network):
        body = client.get("/api/search", {"origin": PARIS, "date": "2026-08-10"}).json()

        assert body["mode"] == "from"
        assert body["origin"]["label"] == PARIS
        assert body["origin"]["coords"] is not None
        assert [d["label"] for d in body["destinations"]] == [LYON]
        assert [t["trainNumber"] for t in body["destinations"][0]["trains"]] == ["6601", "6602"]

    def test_a_city_is_not_its_own_destination(self, client, network):
        body = client.get("/api/search", {"origin": PARIS, "date": "2026-08-10"}).json()

        assert PARIS not in [d["label"] for d in body["destinations"]]

    def test_reverse_search_lists_origins(self, client, network):
        body = client.get(
            "/api/search", {"origin": LYON, "date": "2026-08-10", "mode": "to"}
        ).json()

        assert [d["label"] for d in body["destinations"]] == [PARIS]

    def test_range_mode_carries_the_days(self, client, network):
        body = client.get(
            "/api/search",
            {"origin": PARIS, "date": "2026-08-10", "dateTo": "2026-08-11", "mode": "range"},
        ).json()

        assert body["destinations"][0]["availableDates"] == ["2026-08-10", "2026-08-11"]
        assert body["dateTo"] == "2026-08-11"

    def test_round_trip_keeps_only_what_comes_back(self, client, network):
        body = client.get(
            "/api/search",
            {"origin": PARIS, "date": "2026-08-10", "dateTo": "2026-08-10", "mode": "roundtrip"},
        ).json()

        assert [d["label"] for d in body["destinations"]] == [LYON]
        assert [t["trainNumber"] for t in body["destinations"][0]["returnTrains"]] == ["6690"]

    def test_enriches_with_popularity_and_booking_slug(self, client, network):
        destination = client.get("/api/search", {"origin": PARIS, "date": "2026-08-10"}).json()[
            "destinations"
        ][0]

        assert destination["slug"] == "lyon"
        assert destination["popularity"] > 0

    def test_refuses_an_unreal_date(self, client, network):
        assert client.get("/api/search", {"origin": PARIS, "date": "2026-02-31"}).status_code == 400

    def test_refuses_a_label_the_dataset_could_not_contain(self, client, network):
        response = client.get("/api/search", {"origin": 'PARIS" or 1=1', "date": "2026-08-10"})

        assert response.status_code == 400
        assert "libellé de gare invalide" in response.json()["detail"]

    def test_names_an_unknown_station(self, client, network):
        response = client.get("/api/search", {"origin": "GARE INEXISTANTE", "date": "2026-08-10"})

        assert response.status_code == 400
        assert response.json()["unknown"] == ["GARE INEXISTANTE"]

    def test_range_mode_needs_a_second_date(self, client, network):
        response = client.get(
            "/api/search", {"origin": PARIS, "date": "2026-08-10", "mode": "range"}
        )

        assert response.status_code == 400
        assert "dateTo" in response.json()["detail"]

    def test_a_return_cannot_precede_the_outbound(self, client, network):
        response = client.get(
            "/api/search",
            {"origin": PARIS, "date": "2026-08-11", "dateTo": "2026-08-10", "mode": "roundtrip"},
        )

        assert response.status_code == 400

    def test_refuses_a_date_past_the_horizon(self, client, network):
        response = client.get("/api/search", {"origin": PARIS, "date": "2027-01-01"})

        assert response.status_code == 400
        assert "horizon" in response.json()["detail"]


@pytest.mark.django_db
def test_return_dates(client, network):
    body = client.get("/api/returns", {"origin": PARIS, "dest": LYON, "from": "2026-08-10"}).json()

    assert body == {"origin": PARIS, "destination": LYON, "dates": ["2026-08-10", "2026-08-11"]}


@pytest.mark.django_db
class TestRoute:
    def test_finds_a_trip_with_one_connection(self, client, network):
        body = client.get(
            "/api/route", {"from": PARIS, "to": MARSEILLE, "date": "2026-08-10", "stops": 1}
        ).json()

        assert body["truncated"] is False
        assert len(body["itineraries"]) == 1
        legs = body["itineraries"][0]["legs"]
        assert [leg["trainNumber"] for leg in legs] == ["6601", "5101"]
        assert legs[0]["fromCoords"] is not None
        assert body["itineraries"][0]["stops"] == 1

    def test_a_connection_too_tight_is_not_offered(self, client, network):
        # 08:00 → 10:00 then 10:30 leaves 30 minutes, which passes; 10:05 would not.
        offer(D1, LYON, MARSEILLE, "10:05", "11:45", train="trop-juste")

        body = client.get(
            "/api/route", {"from": PARIS, "to": MARSEILLE, "date": "2026-08-10", "stops": 1}
        ).json()

        trains = [leg["trainNumber"] for leg in body["itineraries"][0]["legs"]]
        assert "trop-juste" not in trains

    def test_offers_every_departure_and_not_only_the_fastest(self, client, network):
        offer(D1, LYON, MARSEILLE, "14:30", "16:10", train="5102")

        body = client.get(
            "/api/route", {"from": PARIS, "to": MARSEILLE, "date": "2026-08-10", "stops": 1}
        ).json()

        assert [it["departure"] for it in body["itineraries"]] == ["08:00", "12:00"]

    def test_crossing_paris_takes_more_than_a_platform_change(self, client, network):
        # Arrival in Paris at 08:00, departure at 08:30 from whichever station: 30 minutes
        # is enough to change platforms, not to cross town.
        offer(D1, MARSEILLE, PARIS, "05:00", "08:00", train="montee")
        offer(D1, PARIS, LYON, "08:30", "10:30", train="autre-gare")

        body = client.get(
            "/api/route", {"from": MARSEILLE, "to": LYON, "date": "2026-08-10", "stops": 1}
        ).json()

        assert [leg["trainNumber"] for it in body["itineraries"] for leg in it["legs"]] == [
            "montee",
            "6602",
        ]

    def test_suggests_the_following_days(self, client, network):
        body = client.get(
            "/api/route", {"from": PARIS, "to": LYON, "date": "2026-08-10", "stops": 0}
        ).json()

        assert body["alsoAvailable"] == ["2026-08-11"]

    def test_suggests_a_date_weeks_away(self, client, network):
        # The only Paris → Marseille of the window, three weeks after the day asked for.
        far = date(2026, 8, 31)
        offer(far, PARIS, MARSEILLE, "08:00", "11:20", train="7777")

        body = client.get(
            "/api/route", {"from": PARIS, "to": MARSEILLE, "date": "2026-08-10", "stops": 0}
        ).json()

        assert body["itineraries"] == []
        assert body["alsoAvailable"] == [far.isoformat()]

    def test_suggests_at_most_three_dates(self, client, network):
        for offset in range(1, 6):
            day = date(2026, 8, 12 + offset)
            offer(day, PARIS, MARSEILLE, "08:00", "11:20", train=f"77{offset}")

        body = client.get(
            "/api/route", {"from": PARIS, "to": MARSEILLE, "date": "2026-08-10", "stops": 0}
        ).json()

        assert body["alsoAvailable"] == ["2026-08-13", "2026-08-14", "2026-08-15"]

    def test_refuses_a_trip_to_the_same_city(self, client, network):
        response = client.get(
            "/api/route", {"from": PARIS, "to": "paris (INTRAMUROS)", "date": "2026-08-10"}
        )

        assert response.status_code == 400
        assert "différer" in response.json()["detail"]


@pytest.mark.django_db
class TestMultileg:
    def test_plans_a_chain(self, client, network):
        body = client.get(
            "/api/multileg",
            {"stops": f"{PARIS}|{LYON}|{MARSEILLE}", "date": "2026-08-10"},
        ).json()

        assert body["blockedAt"] is None
        assert [hop["trainNumber"] for hop in body["itinerary"]] == ["6601", "5101"]

    def test_refuses_a_single_stop(self, client, network):
        response = client.get("/api/multileg", {"stops": PARIS, "date": "2026-08-10"})

        assert response.status_code == 400
        assert "deux gares" in response.json()["detail"]

    def test_refuses_seven_stops(self, client, network):
        response = client.get(
            "/api/multileg", {"stops": "|".join([PARIS, LYON] * 4), "date": "2026-08-10"}
        )

        assert response.status_code == 400

    def test_refuses_the_same_stop_twice_in_a_row(self, client, network):
        response = client.get(
            "/api/multileg", {"stops": f"{PARIS}|{PARIS}|{LYON}", "date": "2026-08-10"}
        )

        assert response.status_code == 400
        assert "identiques" in response.json()["detail"]

    def test_clamps_the_window_to_the_data(self, client, network):
        body = client.get(
            "/api/multileg",
            {
                "stops": f"{PARIS}|{LYON}",
                "date": "2026-01-01",
                "dateTo": "2026-12-31",
            },
        ).json()

        assert body["window"] == {"from": "2026-08-10", "to": "2026-08-11"}

    def test_rejects_a_stay_beyond_three_days(self, client, network):
        response = client.get(
            "/api/multileg",
            {"stops": f"{PARIS}|{LYON}", "date": "2026-08-10", "minStay": "999"},
        )

        assert response.status_code == 400
        assert "minStay" in response.json()["detail"]


@pytest.mark.django_db
def test_says_when_nothing_is_ingested(client):
    response = client.get("/api/search", {"origin": PARIS, "date": "2026-08-10"})
    assert response.status_code == 503
