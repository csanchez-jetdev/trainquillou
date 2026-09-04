from datetime import date, time

import pytest

from tgvmax import multileg
from tgvmax.models import Offer, Station

A = "PARIS (intramuros)"
B = "LYON (intramuros)"
C = "MARSEILLE ST CHARLES"

D1 = date(2026, 8, 10)
D2 = date(2026, 8, 11)
WINDOW = (D1, date(2026, 8, 20))


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


@pytest.mark.django_db
class TestPlan:
    def test_chains_three_stops_on_one_day(self):
        offer(D1, A, B, "08:00", "10:00")
        offer(D1, B, C, "11:00", "14:00")

        result = multileg.plan([A, B, C], WINDOW)

        assert result["blockedAt"] is None
        assert [leg["date"] for leg in result["itinerary"]] == ["2026-08-10", "2026-08-10"]
        assert [leg["departure"] for leg in result["itinerary"]] == ["08:00", "11:00"]

    def test_reports_the_leg_that_has_no_direct_train(self):
        offer(D1, A, B, "08:00", "10:00")

        result = multileg.plan([A, B, C], WINDOW)

        assert result["blockedAt"] == 1
        assert result["itinerary"] is None
        # The reachable part is still described, so the traveller sees where it breaks.
        assert result["legs"][0]["options"] == 1
        assert result["legs"][1]["options"] == 0

    def test_a_connection_must_leave_after_the_previous_arrival(self):
        offer(D1, A, B, "08:00", "10:00")
        offer(D1, B, C, "09:00", "12:00", train="dep-trop-tot")
        offer(D1, B, C, "10:30", "13:30", train="ok")

        result = multileg.plan([A, B, C], WINDOW)

        assert result["itinerary"][1]["trainNumber"] == "ok"

    def test_minimum_stay_pushes_to_a_later_train(self):
        offer(D1, A, B, "08:00", "10:00")
        offer(D1, B, C, "11:00", "14:00", train="trop-court")
        offer(D1, B, C, "15:00", "18:00", train="apres-quatre-heures")

        result = multileg.plan([A, B, C], WINDOW, min_stay_hours=4)

        assert result["itinerary"][1]["trainNumber"] == "apres-quatre-heures"

    def test_picks_the_earliest_arrival_not_the_earliest_departure(self):
        """A later but faster train leaves more room for the rest of the chain."""
        offer(D1, A, B, "08:00", "14:00", train="lent")
        offer(D1, A, B, "09:00", "11:00", train="rapide")
        offer(D1, B, C, "12:00", "15:00")

        result = multileg.plan([A, B, C], WINDOW)

        assert result["itinerary"][0]["trainNumber"] == "rapide"
        assert result["blockedAt"] is None

    def test_a_night_train_arrives_the_next_day(self):
        offer(D1, A, B, "22:00", "06:00", train="nuit")
        offer(D1, B, C, "07:00", "09:00", train="meme-jour-trop-tot")
        offer(D2, B, C, "08:00", "10:00", train="lendemain")

        result = multileg.plan([A, B, C], WINDOW)

        assert result["itinerary"][1]["trainNumber"] == "lendemain"
        assert result["itinerary"][1]["date"] == "2026-08-11"

    def test_a_loop_comes_back_to_its_first_stop(self):
        offer(D1, A, B, "08:00", "10:00")
        offer(D1, B, A, "18:00", "20:00", train="retour")

        result = multileg.plan([A, B, A], WINDOW, min_stay_hours=6)

        assert result["blockedAt"] is None
        assert result["itinerary"][1]["trainNumber"] == "retour"

    def test_a_day_trip_needs_the_return_on_the_same_day(self):
        offer(D1, A, B, "08:00", "10:00")
        offer(D2, B, A, "18:00", "20:00")

        same_day = multileg.plan([A, B, A], (D1, D1), min_stay_hours=4)

        assert same_day["blockedAt"] == 1

    def test_lists_the_days_each_leg_is_available(self):
        offer(D1, A, B, "08:00", "10:00")
        offer(D2, A, B, "08:00", "10:00")
        offer(D1, B, C, "11:00", "14:00")

        result = multileg.plan([A, B, C], WINDOW)

        assert result["legs"][0]["days"] == ["2026-08-10", "2026-08-11"]
        assert result["legs"][1]["days"] == ["2026-08-10"]

    def test_sold_out_offers_are_ignored(self):
        offer(D1, A, B, "08:00", "10:00").__class__.objects.update(bookable=False)

        result = multileg.plan([A, B], WINDOW)

        assert result["legs"][0]["options"] == 0
        assert result["blockedAt"] == 0


@pytest.mark.django_db
class TestResolveStops:
    def test_matches_a_label_written_differently(self):
        offer(D1, A, B, "08:00", "10:00")

        resolved, unknown = multileg.resolve_stops(["paris (INTRAMUROS)", "Lyon-Intramuros"])

        assert resolved == [A, B]
        assert unknown == []

    def test_reports_a_station_the_dataset_never_names(self):
        offer(D1, A, B, "08:00", "10:00")

        resolved, unknown = multileg.resolve_stops([A, "GARE INEXISTANTE"])

        assert resolved == [A]
        assert unknown == ["GARE INEXISTANTE"]

    def test_a_station_with_no_seat_left_is_still_known(self):
        offer(D1, A, B, "08:00", "10:00", train="x").__class__.objects.update(bookable=False)

        _, unknown = multileg.resolve_stops([A, B])

        assert unknown == []
