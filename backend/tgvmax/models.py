from django.db import models


class Offer(models.Model):
    # The natural key needs all six fields: the same train on the same day appears with two
    # departure times (490 cases) or two arrival times (349), and would merge otherwise.
    date = models.DateField()
    train_no = models.CharField(max_length=8)
    origin = models.CharField(max_length=64)
    destination = models.CharField(max_length=64)
    departure = models.TimeField()
    arrival = models.TimeField()

    # Turned off by vanishing from a later export, never by an upstream flag: the ingested
    # export is already filtered on od_happy_card=OUI.
    bookable = models.BooleanField(default=True)
    first_seen = models.DateField()
    last_seen = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["date", "train_no", "origin", "destination", "departure", "arrival"],
                name="offer_identity",
            )
        ]
        indexes = [
            models.Index(fields=["origin", "date", "bookable"], name="offer_from_idx"),
            models.Index(fields=["destination", "date", "bookable"], name="offer_to_idx"),
            models.Index(fields=["date", "bookable"], name="offer_day_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.date} {self.train_no} {self.origin} → {self.destination}"


class Station(models.Model):
    # Apart from the offers, which hold bookable legs only: deriving the list from them
    # dropped 106 of 341 stations the day this was measured, all momentarily full.
    label = models.CharField(max_length=64, unique=True)
    first_seen = models.DateField()
    last_seen = models.DateField()

    def __str__(self) -> str:
        return self.label


class Coverage(models.Model):
    """How much of one day's published offer, on one commercial axis, is TGVmax-eligible."""

    # Counted in dataset rows like `Offer`, but never joined to it: these totals describe the
    # export as published, not the reconciled state the offers table holds.
    date = models.DateField()
    axis = models.CharField(max_length=32)
    total = models.PositiveIntegerField()
    eligible = models.PositiveIntegerField()
    observed_on = models.DateField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["date", "axis"], name="coverage_identity")]
        indexes = [models.Index(fields=["date"], name="coverage_day_idx")]

    def __str__(self) -> str:
        return f"{self.date} {self.axis} {self.eligible}/{self.total}"


class Ingestion(models.Model):
    """One reconciled export, and what it moved."""

    # One row per day observed: `AvailabilityChange` holds the flips but not how many
    # observations produced them, so a rate read from it alone divides by an unrecorded number.
    observed_on = models.DateField(unique=True)
    rows = models.PositiveIntegerField()
    observed = models.PositiveIntegerField()
    created = models.PositiveIntegerField()
    reappeared = models.PositiveIntegerField()
    vanished = models.PositiveIntegerField()

    class Meta:
        ordering = ["observed_on"]

    def __str__(self) -> str:
        return f"{self.observed_on} +{self.created} −{self.vanished}"


class AxisStation(models.Model):
    # The export has no `axe` column, so this comes from the same unfiltered aggregate as
    # `Coverage` and is replaced wholesale on each run.
    axis = models.CharField(max_length=32)
    label = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["axis", "label"], name="axis_station_identity")
        ]

    def __str__(self) -> str:
        return f"{self.axis} · {self.label}"


class AvailabilityChange(models.Model):
    """A flip in an offer's availability, recorded the day it is observed."""

    # The one table nothing can rebuild: upstream is a rolling 30-day window, so whatever was
    # not written down the day it was visible is gone for good.
    offer = models.ForeignKey(Offer, on_delete=models.CASCADE, related_name="changes")
    seen_on = models.DateField()
    bookable = models.BooleanField()

    class Meta:
        indexes = [models.Index(fields=["seen_on"], name="change_day_idx")]

    def __str__(self) -> str:
        return f"{self.seen_on} {'libre' if self.bookable else 'complet'} {self.offer_id}"
