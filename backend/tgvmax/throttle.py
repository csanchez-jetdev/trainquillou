# ponytail: counters in memory, therefore per process — several workers multiply the
# effective budget by their count. Shared counters need an external store.

import math
import time

from django.http import HttpRequest, HttpResponse, JsonResponse

WINDOW_SECONDS = 60

# Wide on purpose: nothing here leaves the machine, and an office or a mobile carrier behind
# one NAT shares an address.
BUDGET = 300

# Cost of a call, where it is not 1.
COST: dict[str, int] = {}

# Past this the table is dropped: a reset costs one free window.
MAX_TRACKED = 20_000


def client_ip(request: HttpRequest) -> str:
    """The peer address."""
    # Only sound behind a proxy that replaces X-Forwarded-For rather than appending to it:
    # otherwise a forged header defeats the budget.
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "unknown"


class RateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # ip -> [units used, monotonic deadline]
        self._buckets: dict[str, list[float]] = {}

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        ip = client_ip(request)
        cost = COST.get(request.path, 1)
        now = time.monotonic()
        bucket = self._buckets.get(ip)

        if bucket is None or now >= bucket[1]:
            if len(self._buckets) >= MAX_TRACKED:
                self._buckets.clear()
            self._buckets[ip] = [cost, now + WINDOW_SECONDS]
            return self.get_response(request)

        bucket[0] += cost
        if bucket[0] > BUDGET:
            response = JsonResponse(
                {"detail": "Trop de requêtes, réessayez dans un instant."}, status=429
            )
            response["Retry-After"] = str(max(1, math.ceil(bucket[1] - now)))
            return response

        return self.get_response(request)
