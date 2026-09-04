from django.contrib.admin.apps import AdminConfig


class TrainquillouAdminConfig(AdminConfig):
    default_site = "tgvmax.admin_site.TrainquillouAdminSite"
