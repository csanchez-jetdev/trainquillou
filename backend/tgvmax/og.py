"""
Share image for one liaison: what a pasted link shows on Slack, X or iMessage.

Drawn rather than photographed, because the interesting part is the figures of the day. The
site's own woff2 files are read straight from disk — FreeType decodes the format, so the
brand faces need no second copy in another format.
"""

from datetime import date as Date
from functools import lru_cache
from io import BytesIO

from django.conf import settings
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630

NAVY = "#0b1f3a"
TEAL = "#14b8b0"
WHITE = "#ffffff"
MUTED = "#9fb2ca"
FAINT = "#1b3457"

# Locales are not installed in a slim image, so the names are spelled here.
DAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
MONTHS = (
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)


@lru_cache(maxsize=8)
def _font(name: str, size: int, weight: float) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(settings.FONT_DIR / name), size)
    font.set_variation_by_axes([weight])
    return font


def _display(size: int, weight: float = 800) -> ImageFont.FreeTypeFont:
    return _font("archivo-latin-var.woff2", size, weight)


def _body(size: int, weight: float = 400) -> ImageFont.FreeTypeFont:
    return _font("inter-latin-var.woff2", size, weight)


# Doit rester identique à `ACRONYMS` dans `shared/stations.ts`.
ACRONYMS = frozenset({"TGV", "SNCF", "CDG", "HBF", "HB", "SBB", "RER", "TER", "BV"})


def pretty_label(label: str) -> str:
    """
    Readable station name, as the page spells it: "PARIS (intramuros)" becomes "Paris".

    Mirrors `prettyLabel` in `shared/stations.ts`. An image that titled the pair differently
    from the page it illustrates would look like it belonged to another site.
    """
    words = label.replace("(intramuros)", "").replace("(INTRAMUROS)", "").split()
    return " ".join(
        word.upper() if word.upper().replace(".", "") in ACRONYMS else word.capitalize()
        for word in words
    )


def human_day(iso: str) -> str:
    day = Date.fromisoformat(iso)
    return f"{DAYS[day.weekday()]} {day.day} {MONTHS[day.month - 1]}"


def _duration(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    return f"{hours} h {rest:02d}" if hours else f"{rest} min"


def _tracked(draw: ImageDraw.ImageDraw, xy, text: str, font, fill: str, tracking: float) -> None:
    """Letter-spaced text, which Pillow draws no other way."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += font.getlength(char) + tracking


def _arrow(draw: ImageDraw.ImageDraw, x: float, middle: float, size: float, fill: str) -> float:
    """Drawn, not typed: the site's Latin subsets carry no U+2192 and print a tofu box."""
    stroke = max(2.0, size / 10)
    head = size / 2.2
    draw.line((x, middle, x + size, middle), fill=fill, width=round(stroke))
    draw.polygon(
        [(x + size, middle - head / 2), (x + size, middle + head / 2), (x + size + head, middle)],
        fill=fill,
    )
    return x + size + head


MARGIN = 72
TITLE_SIZES = (60, 54, 48, 42, 38)


def _title(draw: ImageDraw.ImageDraw, origin: str, destination: str) -> None:
    """
    The pair, shrunk to fit and broken in two when even the smallest size overflows.

    "Marseille St Charles → Bordeaux St Jean" is more than twice "Paris → Lyon": a fixed size
    would run off the right edge, and a cropped station name is worse than a smaller one.
    """
    room = WIDTH - 2 * MARGIN
    gap = 26

    def width(font: ImageFont.FreeTypeFont, *parts: str) -> float:
        return sum(font.getlength(part) for part in parts)

    for size in TITLE_SIZES:
        font = _display(size)
        head = size * 0.57
        if width(font, "TGVmax ", origin, destination) + head * 1.45 + 2 * gap <= room:
            x = float(MARGIN)
            draw.text((x, 128), "TGVmax", font=font, fill=TEAL)
            x += font.getlength("TGVmax ")
            draw.text((x, 128), origin, font=font, fill=WHITE)
            x += font.getlength(origin) + gap
            x = _arrow(draw, x, 128 + size * 0.66, head, WHITE) + gap
            draw.text((x, 128), destination, font=font, fill=WHITE)
            return

    font = _display(44)
    draw.text((MARGIN, 104), "TGVmax", font=font, fill=TEAL)
    draw.text((MARGIN + font.getlength("TGVmax "), 104), origin, font=font, fill=WHITE)
    x = _arrow(draw, float(MARGIN), 104 + 60 + 44 * 0.66, 44 * 0.57, WHITE) + gap
    draw.text((x, 164), destination, font=font, fill=WHITE)


def render(origin: str, destination: str, liaison: dict) -> bytes:
    """The pair, its soonest bookable day and what runs that day, as a PNG."""
    image = Image.new("RGB", (WIDTH, HEIGHT), NAVY)
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 0, 10, HEIGHT), fill=TEAL)
    _tracked(draw, (72, 62), "TRAINQUILLOU", _body(24, 600), MUTED, 3.2)

    _title(draw, pretty_label(origin), pretty_label(destination))

    days = liaison["days"]
    if not days:
        draw.text(
            (72, 258),
            "Aucun direct sur les trente prochains jours",
            font=_display(44),
            fill=WHITE,
        )
        draw.text(
            (72, 330),
            "Les itinéraires avec correspondance sont sur la page.",
            font=_body(28),
            fill=MUTED,
        )
        return _encode(image)

    soonest = days[0]
    draw.rectangle((72, 248, WIDTH - 72, 470), fill=FAINT)
    _tracked(draw, (104, 282), "PROCHAIN JOUR RÉSERVABLE", _body(22, 600), TEAL, 2.4)
    draw.text((104, 318), human_day(soonest["date"]), font=_display(56), fill=WHITE)

    trains = soonest["trains"]
    facts = "  ·  ".join(
        [
            f"{trains} {'trains directs' if trains > 1 else 'train direct'}",
            f"premier à {soonest['first']}",
            f"le plus rapide {_duration(soonest['fastestMin'])}",
        ]
    )
    draw.text((104, 400), facts, font=_body(28), fill=MUTED)

    count, returns = len(days), len(liaison["returnDates"])
    summary = (
        f"{count} {'jours réservables' if count > 1 else 'jour réservable'} sur les 30 prochains"
        f"  ·  retour sur {returns} {'jours' if returns > 1 else 'jour'}"
    )
    draw.text((72, 516), summary, font=_body(30), fill=WHITE)
    draw.text((72, 562), "Places TGVmax, open data SNCF", font=_body(24), fill=MUTED)

    return _encode(image)


def _encode(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
