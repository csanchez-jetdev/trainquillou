# The real module refuses to load without a secret key, and pytest reads settings before
# any conftest could set one.

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-never-deployed")

from .settings import *  # noqa: E402, F403

# WhiteNoise reads a directory that only exists in the built image, and warns on every test.
MIDDLEWARE = [m for m in MIDDLEWARE if "whitenoise" not in m]  # noqa: F405
