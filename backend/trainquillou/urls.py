from django.contrib import admin
from django.urls import path

from tgvmax.api import api

# The reverse proxy puts an HTTP authentication in front of /admin/, so the Django login
# page is never reachable by a scanner.
urlpatterns = [
    path("api/", api.urls),
    path("admin/", admin.site.urls),
]
