import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


DEBUG = env_flag("DJANGO_DEBUG")

# This repo is public, so any fallback committed here would be a known key: outside
# development a missing variable stops the boot.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or ("dev-insecure-key" if DEBUG else "")
if not SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY est requis quand DJANGO_DEBUG est faux")

if DEBUG:
    # `runserver` gets bound to the LAN so a phone can reach it, at an address that moves.
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = [h for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if h] or []

# Auth and sessions serve the admin alone; the public API stays read-only and accountless.
INSTALLED_APPS = [
    "trainquillou.apps.TrainquillouAdminConfig",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_tasks_db",
    "tgvmax",
]

# WhiteNoise sits directly under the security middleware, as its documentation requires,
# and above the throttle so admin assets never spend API budget.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "tgvmax.throttle.RateLimitMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "trainquillou.urls"
WSGI_APPLICATION = "trainquillou.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# Collected at image build time: the container filesystem is read-only at runtime.
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DJANGO_DB_PATH", BASE_DIR / "db.sqlite3"),
        "OPTIONS": {
            # WAL lets the worker write while the server reads; IMMEDIATE and an explicit
            # timeout are what Django's SQLite notes recommend against "database is locked".
            "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
            "transaction_mode": "IMMEDIATE",
            "timeout": 20,
        },
    }
}

# Django core ships development backends only (immediate, dummy) and no worker;
# django_tasks_db keeps the queue in this same file, drained by `manage.py db_worker`.
TASKS = {
    "default": {
        "BACKEND": "django_tasks_db.DatabaseBackend",
        "QUEUES": ["default"],
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# SNCF station reference and notoriety scores, generated offline by scripts/build-*.py.
REFERENCE_DATA_DIR = Path(os.environ.get("TRAINQUILLOU_DATA_DIR", BASE_DIR / "tgvmax" / "data"))

# Booking slugs stay in the shared tree: the prerendered station pages import the same file.
BOOKING_DATA_DIR = Path(os.environ.get("TRAINQUILLOU_BOOKING_DIR", BASE_DIR.parent / "shared"))

# Next to the database, so the one writable volume holds both.
BACKUP_DIR = Path(
    os.environ.get("DJANGO_BACKUP_DIR", Path(DATABASES["default"]["NAME"]).parent / "sauvegardes")
)

# Dataset times are local wall-clock strings kept verbatim; UTC covers our own timestamps.
TIME_ZONE = "UTC"
USE_TZ = True

# Enabled for the built-in form messages, which reach people and ship translated.
LANGUAGE_CODE = "fr-fr"
USE_I18N = True

# The proxy terminates TLS and talks plain HTTP here; without this every request reads
# as insecure.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# HTTPS redirection and HSTS are the reverse proxy's; set here too they would duplicate
# headers on every JSON reply.
SILENCED_SYSTEM_CHECKS = ["security.W004", "security.W008"]

# HTTPS-only cookies, except in development where there is no TLS to carry them.
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG

# Derived from the hosts, not restated: a reachable host absent here fails every admin
# save with a CSRF error and nothing else.
CSRF_TRUSTED_ORIGINS = [] if DEBUG else [f"https://{host}" for host in ALLOWED_HOSTS]

# Guards `createsuperuser` alone: the admin has no signup and no password reset.
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "{levelname} {name} {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO")},
}
