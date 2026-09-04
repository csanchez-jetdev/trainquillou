"""What the public statistics page is allowed to claim, given the stored offers."""

from datetime import date, time

import pytest
from django.core.cache import cache

from tgvmax.models import AvailabilityChange, AxisStation, Coverage, Ingestion, Offer, Station

PARIS = "PARIS (intramuros)"
LYON = "LYON (intramuros)"
MARSEILLE = "MARSEILLE ST CHARLES"
MANGLED = "ANGOULA" + chr(0x8A) + "ME"

D1 = date(2026, 8, 10)
D2 = date(2026, 8, 11)
INGESTED_ON = date(2026, 8, 12)


@pytest.fixture(autouse=True)
def _no_cached_snapshot():
    """The route caches in process memory, which otherwise leaks between tests."""
    cache.clear()


def offer(
    day,
    origin,
    destination,
    train,
    *,
    bookable=True,
    first_seen=D1,
    departure=time(8, 0),
    arrival=time(10, 0),
):
    for label in (origin, destination):
        Station.objects.get_or_create(label=label, defaults={"first_seen": day, "last_seen": day})
    return Offer.objects.create(
        date=day,
        train_no=train,
        origin=origin,
        destination=destination,
        departure=departure,
        arrival=arrival,
        bookable=bookable,
        first_seen=first_seen,
        last_seen=INGESTED_ON,
    )


@pytest.fixture
def network(db):
    offer(D1, PARIS, LYON, "6601")
    offer(D1, PARIS, LYON, "6602")
    offer(D1, PARIS, MARSEILLE, "6100")
    offer(D2, LYON, MARSEILLE, "5101")
    # A city on both ends: a real train the product never counts as a destination.
    offer(D1, PARIS, PARIS, "9999")
    # Sold out since the first ingestion, so absent from every current-window count.
    sold_out = offer(D2, PARIS, LYON, "6604", bookable=False)
    AvailabilityChange.objects.create(offer=sold_out, seen_on=INGESTED_ON, bookable=False)
    # Named by the dataset with no seat left: known, not served.
    Station.objects.get_or_create(label=MARSEILLE, defaults={"first_seen": D1, "last_seen": D1})
    Station.objects.create(label="BREST", first_seen=D1, last_seen=D1)
    Station.objects.create(label=MANGLED, first_seen=D1, last_seen=D1)


@pytest.mark.django_db
class TestStats:
    def test_counts_only_bookable_offers_over_the_stored_window(self, client, network):
        body = client.get("/api/stats").json()

        assert body["offers"] == 5
        assert body["window"] == {"first": "2026-08-10", "last": "2026-08-11"}
        assert body["updatedOn"] == "2026-08-12"

    def test_a_city_is_not_a_route_to_itself(self, client, network):
        body = client.get("/api/stats").json()

        assert body["routes"] == 3  # PARIS→LYON, PARIS→MARSEILLE, LYON→MARSEILLE

    def test_served_stations_are_fewer_than_the_ones_the_dataset_names(self, client, network):
        body = client.get("/api/stats").json()

        # BREST is named without a seat; the mis-encoded label is excluded from both.
        assert body["stations"] == {"served": 3, "known": 4}

    def test_daily_is_ordered_and_accounts_for_every_offer(self, client, network):
        body = client.get("/api/stats").json()

        assert body["daily"] == [
            {"date": "2026-08-10", "offers": 4},
            {"date": "2026-08-11", "offers": 1},
        ]
        assert sum(day["offers"] for day in body["daily"]) == body["offers"]

    def test_top_origins_rank_by_offers_and_count_distinct_destinations(self, client, network):
        body = client.get("/api/stats").json()

        assert body["topOrigins"] == [
            {"label": PARIS, "offers": 3, "destinations": 2},
            {"label": LYON, "offers": 1, "destinations": 1},
        ]

    def test_history_dates_the_first_ingestion_rather_than_counting_days(self, client, network):
        body = client.get("/api/stats").json()

        # An instance older than the ledger has flips but no reading to divide them by.
        assert body["history"] == {
            "since": "2026-08-10",
            "soldOut": 1,
            "reopened": 0,
            "runs": [],
            "leadTimes": [],
        }


@pytest.mark.django_db
class TestReadings:
    """What comparing one daily reading to the next is allowed to claim."""

    def test_each_recorded_reading_carries_its_own_denominator(self, client, db):
        Ingestion.objects.create(
            observed_on=D1, rows=12, observed=10, created=10, reappeared=0, vanished=0
        )
        Ingestion.objects.create(
            observed_on=D2, rows=9, observed=8, created=1, reappeared=2, vanished=3
        )

        offer(D1, PARIS, LYON, "1")
        runs = client.get("/api/stats").json()["history"]["runs"]

        assert runs == [
            {"date": "2026-08-10", "observed": 10, "created": 10, "reappeared": 0, "vanished": 0},
            {"date": "2026-08-11", "observed": 8, "created": 1, "reappeared": 2, "vanished": 3},
        ]

    def test_lead_times_count_the_days_left_before_the_departure(self, client, db):
        offer(D1, PARIS, LYON, "0")
        far = offer(date(2026, 8, 20), PARIS, LYON, "1", bookable=False)
        near = offer(date(2026, 8, 12), PARIS, LYON, "2", bookable=False)
        also_near = offer(date(2026, 8, 12), PARIS, MARSEILLE, "3", bookable=False)
        for gone in (far, near, also_near):
            AvailabilityChange.objects.create(offer=gone, seen_on=D1, bookable=False)

        lead_times = client.get("/api/stats").json()["history"]["leadTimes"]

        assert lead_times == [{"days": 2, "soldOut": 2}, {"days": 10, "soldOut": 1}]

    def test_a_reopening_is_not_a_disappearance(self, client, db):
        back = offer(D2, PARIS, LYON, "1")
        AvailabilityChange.objects.create(offer=back, seen_on=D1, bookable=True)

        assert client.get("/api/stats").json()["history"]["leadTimes"] == []

    def test_a_flip_seen_after_its_departure_is_dropped_rather_than_counted_backwards(
        self, client, db
    ):
        offer(D1, PARIS, LYON, "0")
        gone = offer(D1, PARIS, LYON, "1", bookable=False)
        AvailabilityChange.objects.create(offer=gone, seen_on=INGESTED_ON, bookable=False)

        assert client.get("/api/stats").json()["history"]["leadTimes"] == []

    def test_the_map_weighs_a_station_by_what_it_loses_as_well_as_by_what_it_carries(
        self, client, db
    ):
        offer(D1, PARIS, LYON, "1")
        gone = offer(D2, PARIS, MARSEILLE, "2", bookable=False)
        AvailabilityChange.objects.create(offer=gone, seen_on=D1, bookable=False)

        stations = client.get("/api/stats").json()["network"]["stations"]

        # The lost departure counts for Paris without adding it to the bookable offers.
        assert [(s["label"], s["offers"], s["soldOut"]) for s in stations] == [(PARIS, 1, 1)]


@pytest.mark.django_db
class TestScopedToOneStation:
    """What `?origin=` narrows, and what it deliberately does not."""

    def test_counts_only_the_legs_that_leave_from_it(self, client, network):
        body = client.get("/api/stats", {"origin": PARIS}).json()

        # Of the five bookable legs, three leave Paris; the fourth leaves Lyon and the fifth
        # is the Paris-to-Paris row the product never counts.
        assert body["origin"] == PARIS
        assert body["offers"] == 4
        assert body["stations"] == {"served": 2, "known": 4}

    def test_the_ranking_of_departure_stations_goes_away_rather_than_listing_itself(
        self, client, network
    ):
        body = client.get("/api/stats", {"origin": PARIS}).json()

        assert body["topOrigins"] == []
        assert [row["label"] for row in body["topDestinations"]] == [LYON, MARSEILLE]

    def test_the_eligibility_share_is_dropped_because_it_has_no_station(self, client, network):
        Coverage.objects.create(
            date=D1, axis="SUD EST", total=100, eligible=20, observed_on=INGESTED_ON
        )

        assert client.get("/api/stats", {"origin": PARIS}).json()["coverage"] is None

    def test_the_map_draws_what_the_station_reaches_rather_than_the_station(self, client, network):
        stations = client.get("/api/stats", {"origin": PARIS}).json()["network"]["stations"]

        assert sorted(row["label"] for row in stations) == sorted([LYON, MARSEILLE])

    def test_an_unknown_station_is_refused_rather_than_counted_as_nothing(self, client, network):
        response = client.get("/api/stats", {"origin": "GARE DE NULLE PART"})

        assert response.status_code == 400
        assert response.json()["unknown"] == ["GARE DE NULLE PART"]

    def test_a_station_with_no_bookable_leg_left_refuses_rather_than_reporting_zeroes(
        self, client, network
    ):
        assert client.get("/api/stats", {"origin": "BREST"}).status_code == 503


@pytest.mark.django_db
class TestShape:
    def test_departure_hours_are_counted_from_the_time_column(self, client, db):
        offer(D1, PARIS, LYON, "1", departure=time(6, 5))
        offer(D1, PARIS, LYON, "2", departure=time(6, 55))
        offer(D1, PARIS, LYON, "3", departure=time(23, 30))

        hourly = client.get("/api/stats").json()["hourly"]

        assert {row["hour"]: row["offers"] for row in hourly} == {6: 2, 23: 1}

    def test_weekdays_report_how_many_of_that_day_the_window_holds(self, client, db):
        # 10 and 17 August 2026 are Mondays, 11 August a Tuesday.
        offer(D1, PARIS, LYON, "1")
        offer(date(2026, 8, 17), PARIS, LYON, "2")
        offer(D2, PARIS, LYON, "3")

        weekdays = client.get("/api/stats").json()["weekdays"]

        assert weekdays == [
            {"weekday": 1, "offers": 2, "days": 2},
            {"weekday": 2, "offers": 1, "days": 1},
        ]

    def test_a_leg_past_midnight_lands_in_a_band_rather_than_a_negative_duration(self, client, db):
        offer(D1, PARIS, LYON, "1", departure=time(8, 0), arrival=time(9, 0))
        # Leaves at 23:10, arrives at 06:40: seven and a half hours, not minus sixteen.
        offer(D1, PARIS, MARSEILLE, "2", departure=time(23, 10), arrival=time(6, 40))

        durations = client.get("/api/stats").json()["durations"]

        assert {row["band"]: row["offers"] for row in durations} == {
            "t1": 1,
            "t2": 0,
            "t3": 0,
            "t4": 1,
        }

    def test_the_map_folds_both_directions_of_a_link_into_one_line(self, client, db):
        offer(D1, PARIS, LYON, "1")
        offer(D1, PARIS, LYON, "2")
        offer(D1, LYON, PARIS, "3")

        body = client.get("/api/stats").json()

        assert body["network"]["linkCount"] == 1
        assert body["routes"] == 1
        [link] = body["network"]["links"]
        assert link["offers"] == 3
        assert {link["from"], link["to"]} == {PARIS, LYON}


@pytest.mark.django_db
class TestCoverage:
    def coverage_rows(self, observed_on=INGESTED_ON):
        Coverage.objects.create(
            date=D1, axis="SUD EST", total=100, eligible=20, observed_on=observed_on
        )
        Coverage.objects.create(
            date=D2, axis="SUD EST", total=100, eligible=10, observed_on=observed_on
        )
        # No eligible seat at all: listed apart, never as a zero on the chart.
        Coverage.objects.create(
            date=D1, axis="OUIGO_nord", total=50, eligible=0, observed_on=observed_on
        )

    def test_shares_come_from_the_aggregate_and_axes_are_named_for_people(self, client, network):
        self.coverage_rows()

        coverage = client.get("/api/stats").json()["coverage"]

        assert (coverage["eligible"], coverage["total"]) == (30, 250)
        assert coverage["axes"] == [
            {"label": "Sud-Est", "total": 200, "eligible": 30, "stations": []}
        ]
        assert coverage["excluded"] == [{"label": "Ouigo Nord", "total": 50}]
        assert [row["date"] for row in coverage["daily"]] == ["2026-08-10", "2026-08-11"]

    def test_an_axis_carries_the_stations_it_leaves_from(self, client, network):
        self.coverage_rows()
        AxisStation.objects.create(axis="SUD EST", label=LYON)
        AxisStation.objects.create(axis="SUD EST", label=MARSEILLE)
        # No coordinates for it: listed by the dataset, simply not drawn.
        AxisStation.objects.create(axis="SUD EST", label="GARE SANS COORDONNEES")

        axes = client.get("/api/stats").json()["coverage"]["axes"]

        assert sorted(axes[0]["stations"]) == [[43.3052, 5.3848], [45.7663, 4.8256]]

    def test_an_aggregate_older_than_the_offers_is_dropped_rather_than_shown(self, client, network):
        self.coverage_rows(observed_on=date(2026, 8, 11))

        assert client.get("/api/stats").json()["coverage"] is None

    def test_no_aggregate_at_all_leaves_the_section_out(self, client, network):
        assert client.get("/api/stats").json()["coverage"] is None


@pytest.mark.django_db
def test_an_empty_database_refuses_rather_than_reporting_zeroes(client):
    response = client.get("/api/stats")

    assert response.status_code == 503
    assert "aucune donnée" in response.json()["detail"]
