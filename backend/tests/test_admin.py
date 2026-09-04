"""What the admin exposes, and what it refuses to let anyone change."""

from datetime import date, time, timedelta

import pytest
from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from django_tasks_db.models import DBTaskResult

from tgvmax.models import AvailabilityChange, Offer, Station

PARIS = "PARIS (intramuros)"
LYON = "LYON (intramuros)"

# A fragment short enough to survive the template's line wrapping.
STALE_WARNING = "fenêtre glissante de 30 jours"


@pytest.fixture
def staff(db):
    return User.objects.create_superuser("op", password="only-for-tests-1234")


@pytest.fixture
def ingested(db):
    """One ingestion, dated today, so the index reports fresh data."""
    today = timezone.localdate()
    for label in (PARIS, LYON):
        Station.objects.get_or_create(
            label=label, defaults={"first_seen": today, "last_seen": today}
        )
    offer = Offer.objects.create(
        date=today + timedelta(days=3),
        train_no="6601",
        origin=PARIS,
        destination=LYON,
        departure=time(8, 0),
        arrival=time(10, 0),
        first_seen=today,
        last_seen=today,
    )
    AvailabilityChange.objects.create(offer=offer, seen_on=today, bookable=False)
    return offer


@pytest.mark.django_db
def test_anonymous_visitors_never_see_the_index(client):
    response = client.get("/admin/")

    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]


@pytest.mark.django_db
def test_the_index_reports_how_fresh_the_data_is(client, staff, ingested):
    client.force_login(staff)

    response = client.get("/admin/")
    body = response.content.decode()

    assert response.status_code == 200
    assert "aujourd'hui" in body
    assert "1 réservables sur 1 observées" in body
    # Absent on a fresh day.
    assert STALE_WARNING not in body


@pytest.mark.django_db
def test_a_missed_day_is_called_out(client, staff, ingested):
    Offer.objects.update(last_seen=timezone.localdate() - timedelta(days=3))
    client.force_login(staff)

    body = client.get("/admin/").content.decode()

    assert "il y a 3 jours" in body
    assert STALE_WARNING in body


@pytest.mark.django_db
def test_an_empty_database_renders_instead_of_failing(client, staff):
    client.force_login(staff)

    body = client.get("/admin/").content.decode()

    assert "l'ingestion n'a jamais abouti" in body
    assert "la minuterie n'a jamais enfilé d'ingestion" in body


@pytest.mark.django_db
@pytest.mark.parametrize("model", ["offer", "station", "availabilitychange"])
def test_ingested_data_cannot_be_edited_by_hand(client, staff, ingested, model):
    """A superuser included: the next export overwrites an edit, and a deletion is final."""
    client.force_login(staff)

    changelist = client.get(f"/admin/tgvmax/{model}/")
    add = client.get(f"/admin/tgvmax/{model}/add/")

    assert changelist.status_code == 200
    assert add.status_code == 403


@pytest.mark.django_db
def test_the_task_queue_is_visible_from_the_admin(client, staff):
    """
    The queue's own admin comes with django-tasks-db and is what says whether an ingestion
    failed. Its URL is derived, not spelled out: the app label is that package's to choose.
    """
    client.force_login(staff)
    opts = DBTaskResult._meta

    response = client.get(reverse(f"admin:{opts.app_label}_{opts.model_name}_changelist"))

    assert response.status_code == 200


@pytest.mark.django_db
def test_offers_are_searchable_by_station(client, staff, ingested):
    client.force_login(staff)

    hit = client.get("/admin/tgvmax/offer/", {"q": "PARIS"})
    miss = client.get("/admin/tgvmax/offer/", {"q": "BREST"})

    assert "6601" in hit.content.decode()
    assert "6601" not in miss.content.decode()


@pytest.mark.django_db
def test_the_date_hierarchy_does_not_break_on_a_real_window(client, staff, ingested):
    client.force_login(staff)
    year = date.today().year

    response = client.get("/admin/tgvmax/offer/", {"date__year": year})

    assert response.status_code == 200
