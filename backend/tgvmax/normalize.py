"""Label normalisation. Must stay identical to `shared/normalize.ts`."""

import re
import unicodedata

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def clean_string(value: str) -> str:
    """Lowercase, no accents, no punctuation, whitespace collapsed."""
    decomposed = unicodedata.normalize("NFD", value or "")
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _NON_ALNUM.sub(" ", stripped.lower()).strip()


def collation_key(label: str) -> tuple[str, str]:
    """Sort key standing in for the JavaScript `localeCompare`."""
    # Punctuation is kept: folding a space and a hyphen together reversed
    # "BERLIN HBF" / "BERLIN-GESUNDBRUNNEN".
    decomposed = unicodedata.normalize("NFD", label or "")
    folded = "".join(c for c in decomposed if not unicodedata.combining(c))
    return (folded.lower(), label)


def same_station(a: str, b: str) -> bool:
    """Do two labels name the same station (tolerant of accents, case and inclusion)?"""
    x = clean_string(a)
    y = clean_string(b)
    if not x or not y:
        return False
    return x == y or y in x or x in y
