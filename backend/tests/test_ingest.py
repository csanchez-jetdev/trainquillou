from datetime import date

import pytest

from tgvmax import ingest
from tgvmax.models import AvailabilityChange, Ingestion, Offer

DAY1 = date(2026, 8, 10)
DAY2 = date(2026, 8, 11)


def row(
    day="2026-08-20",
    train="1234",
    origin="PARIS (intramuros)",
    destination="LYON (intramuros)",
    departure="08:00",
    arrival="10:00",
):
    return {
        "date": day,
        "train_no": train,
        "origine": origin,
        "destination": destination,
        "heure_depart": departure,
        "heure_arrivee": arrival,
    }


@pytest.mark.django_db
def test_second_pass_on_the_same_export_changes_nothing():
    first = ingest.sync([row(), row(train="5678")], observed_on=DAY1)
    assert first.created == 2

    second = ingest.sync([row(), row(train="5678")], observed_on=DAY2)
    assert (second.created, second.vanished, second.reappeared) == (0, 0, 0)
    assert Offer.objects.count() == 2
    assert AvailabilityChange.objects.count() == 0
    assert Offer.objects.filter(last_seen=DAY2).count() == 2


@pytest.mark.django_db
def test_each_day_leaves_one_ledger_row_however_many_passes_it_took():
    ingest.sync([row(), row(train="5678")], observed_on=DAY1)
    ingest.sync([row()], observed_on=DAY2)
    ingest.sync([row()], observed_on=DAY2)

    assert [
        (run.observed_on, run.observed, run.created, run.vanished)
        for run in Ingestion.objects.all()
    ] == [
        (DAY1, 2, 2, 0),
        (DAY2, 1, 0, 1),
    ]


@pytest.mark.django_db
def test_rows_differing_only_by_arrival_are_two_offers():
    """The dataset really does this: same train, same departure, two arrivals."""
    stats = ingest.sync([row(), row(arrival="10:19")], observed_on=DAY1)
    assert stats.created == 2


@pytest.mark.django_db
def test_duplicate_rows_are_collapsed():
    stats = ingest.sync([row(), row()], observed_on=DAY1)
    assert (stats.rows, stats.created) == (2, 1)


@pytest.mark.django_db
def test_disappearance_marks_the_offer_unbookable_and_records_it():
    ingest.sync([row(), row(train="5678")], observed_on=DAY1)

    stats = ingest.sync([row()], observed_on=DAY2)

    assert stats.vanished == 1
    gone = Offer.objects.get(train_no="5678")
    assert gone.bookable is False
    # last_seen is not touched: it says when the seat was last actually there.
    assert gone.last_seen == DAY1
    change = AvailabilityChange.objects.get()
    assert (change.offer_id, change.seen_on, change.bookable) == (gone.id, DAY2, False)


@pytest.mark.django_db
def test_reappearance_flips_it_back_and_records_it():
    ingest.sync([row()], observed_on=DAY1)
    ingest.sync([row(train="5678")], observed_on=DAY2)  # the first one vanishes

    stats = ingest.sync([row(), row(train="5678")], observed_on=date(2026, 8, 12))

    assert stats.reappeared == 1
    assert Offer.objects.get(train_no="1234").bookable is True
    assert [c.bookable for c in AvailabilityChange.objects.order_by("id")] == [False, True]


@pytest.mark.django_db
def test_offers_outside_the_export_window_are_left_alone():
    """A past date leaves the dataset because it is past, not because it sold out."""
    ingest.sync([row(day="2026-08-01")], observed_on=date(2026, 8, 1))

    ingest.sync([row(day="2026-08-20")], observed_on=DAY1)

    old = Offer.objects.get(date=date(2026, 8, 1))
    assert old.bookable is True
    assert AvailabilityChange.objects.count() == 0


@pytest.mark.django_db
def test_empty_export_is_refused():
    ingest.sync([row()], observed_on=DAY1)

    with pytest.raises(ValueError):
        ingest.sync([], observed_on=DAY2)

    assert Offer.objects.get().bookable is True


@pytest.mark.django_db
def test_unreadable_rows_are_counted_and_skipped():
    stats = ingest.sync(
        [row(), row(day="pas-une-date"), {"date": "2026-08-20"}, row(departure="25:99")],
        observed_on=DAY1,
    )
    assert (stats.created, stats.skipped) == (1, 3)
