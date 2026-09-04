# Read-only throughout: the next export overwrites any edit, and AvailabilityChange cannot
# be rebuilt — upstream is a rolling 30-day window, so a deleted row is gone for good.

from django.contrib import admin

from .models import AvailabilityChange, Ingestion, Offer, Station


class ReadOnly(admin.ModelAdmin):
    def has_add_permission(self, request, obj=None) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(Offer)
class OfferAdmin(ReadOnly):
    list_display = (
        "date",
        "departure",
        "arrival",
        "origin",
        "destination",
        "train_no",
        "bookable",
        "last_seen",
    )
    # No date filter: `date_hierarchy` navigates the window, and the two can contradict
    # each other into an empty list with no hint why.
    list_filter = ("bookable",)
    search_fields = ("^origin", "^destination", "=train_no")
    search_help_text = "Début du nom d'une gare, ou numéro de train exact"
    date_hierarchy = "date"
    ordering = ("-date", "departure")


@admin.register(Station)
class StationAdmin(ReadOnly):
    list_display = ("label", "first_seen", "last_seen")
    search_fields = ("^label",)
    ordering = ("label",)


@admin.register(Ingestion)
class IngestionAdmin(ReadOnly):
    list_display = ("observed_on", "observed", "created", "reappeared", "vanished", "rows")
    date_hierarchy = "observed_on"
    ordering = ("-observed_on",)


@admin.register(AvailabilityChange)
class AvailabilityChangeAdmin(ReadOnly):
    list_display = ("seen_on", "bookable", "offer")
    list_filter = ("bookable",)
    date_hierarchy = "seen_on"
    ordering = ("-seen_on",)
    # Without this the changelist runs one query per row to render the offer label.
    list_select_related = ("offer",)
