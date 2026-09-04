# Kept out of admin.py: a @admin.register here re-enters admin.site's lazy setup, and every
# registration would land on the instance that gets discarded.

from django.contrib import admin
from django.db.models import Count, Max, Min, Q
from django.template.response import TemplateResponse
from django.utils import timezone
from django_tasks_db.models import DBTaskResult

from .models import AvailabilityChange, Offer, Station

RECENT_TASKS = 8


class TrainquillouAdminSite(admin.AdminSite):
    site_header = "Trainquillou"
    site_title = "Trainquillou"
    index_title = "Données TGVmax"

    # A distinct name: app template directories are searched in INSTALLED_APPS order, and
    # django.contrib.admin comes first, so an admin/index.html here would never be picked.
    index_template = "admin/trainquillou_index.html"

    def index(self, request, extra_context=None):
        response = super().index(request, extra_context)
        # A redirect means the request never reached the index, so it carries no context.
        if isinstance(response, TemplateResponse):
            response.context_data.update(self.ingestion_context())
        return response

    def ingestion_context(self) -> dict:
        seen = Offer.objects.aggregate(first=Min("first_seen"), last=Max("last_seen"))
        bookable = Offer.objects.filter(bookable=True)
        window = bookable.aggregate(offers=Count("id"), first=Min("date"), last=Max("date"))
        changes = AvailabilityChange.objects.aggregate(
            total=Count("id"),
            sold_out=Count("id", filter=Q(bookable=False)),
            reopened=Count("id", filter=Q(bookable=True)),
        )
        last_seen = seen["last"]

        return {
            "ingested_first": seen["first"],
            "ingested_last": last_seen,
            # A missed day of history cannot be caught up: above 1 means the worker is stuck.
            "stale_days": None if last_seen is None else (timezone.localdate() - last_seen).days,
            "total_offers": Offer.objects.count(),
            "total_stations": Station.objects.count(),
            "window": window,
            "changes": changes,
            "daily": list(bookable.values("date").annotate(offers=Count("id")).order_by("date")),
            "recent_tasks": list(DBTaskResult.objects.order_by("-enqueued_at")[:RECENT_TASKS]),
            "failed_tasks": DBTaskResult.objects.failed().count(),
        }
