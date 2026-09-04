# `Connection.backup` and not a file copy: the database is in WAL mode and the API reads it
# while this runs, so a plain copy would catch an inconsistent file without saying so.

import gzip
import logging
import shutil
import sqlite3
from datetime import date as Date
from pathlib import Path

logger = logging.getLogger(__name__)

KEEP = 30


def write(source: Path, directory: Path, *, on: Date, keep: int = KEEP) -> Path:
    """Write `<date>.sqlite3.gz` into `directory` and drop all but the `keep` newest."""
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{on.isoformat()}.sqlite3.gz"

    # Staged next to the target: /tmp is a small tmpfs the database outgrows.
    staged = directory / f"{on.isoformat()}.sqlite3.partial"
    try:
        origin = sqlite3.connect(source)
        try:
            copy = sqlite3.connect(staged)
            try:
                origin.backup(copy)
            finally:
                copy.close()
        finally:
            origin.close()

        with staged.open("rb") as raw, gzip.open(target, "wb") as compressed:
            shutil.copyfileobj(raw, compressed)
    finally:
        staged.unlink(missing_ok=True)

    prune(directory, keep=keep)
    logger.info("sauvegarde écrite : %s (%d octets)", target, target.stat().st_size)
    return target


def prune(directory: Path, *, keep: int = KEEP) -> list[Path]:
    """Drop the oldest copies. Names sort chronologically, being ISO dates."""
    copies = sorted(directory.glob("*.sqlite3.gz"))
    dropped = copies[: max(0, len(copies) - keep)]
    for old in dropped:
        old.unlink()
    return dropped
