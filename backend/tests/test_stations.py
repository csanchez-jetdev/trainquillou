# Run against the two real files: the full SNCF reference, and the labels the TGVmax
# dataset actually carries.

import json
import math
from pathlib import Path

import pytest
from django.conf import settings

from tgvmax.stations import (
    EXTRA_STATIONS,
    build_coords_index,
    coords_index,
    resolve_coords,
    station_key,
)

GARES = json.loads((Path(settings.REFERENCE_DATA_DIR) / "gares.json").read_text("utf-8"))
TGVMAX_LABELS: list[str] = json.loads(
    (Path(__file__).parent / "fixtures" / "tgvmax-labels.json").read_text("utf-8")
)

INDEX = coords_index()


def distance_km(a, b) -> float:
    """Rough great-circle distance, enough to tell whether a station is in the right place."""
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def assert_near(label: str, expected, tolerance_km: float = 15) -> None:
    got, _ = resolve_coords(INDEX, label)
    assert got is not None, f"{label} n'a pas été résolu"
    gap = distance_km(got, expected)
    assert gap < tolerance_km, f"{label} résolu à {gap:.0f} km du point attendu"


class TestStationKey:
    def test_drops_the_intramuros_marker(self):
        assert station_key("PARIS (intramuros)") == "paris"

    def test_aligns_saint_on_the_reference_abbreviation(self):
        assert station_key("ANGERS SAINT LAUD") == "angers st laud"
        assert station_key("Angers-St-Laud") == "angers st laud"

    def test_both_references_produce_the_same_key(self):
        assert station_key("MONTPELLIER SAINT ROCH") == station_key("Montpellier-St-Roch")

    def test_empty_input(self):
        assert station_key("") == ""
        assert station_key("   ") == ""


class TestPlacementRegressions:
    def test_frankfurt_is_in_germany_not_in_ur_in_the_pyrenees(self):
        assert_near("FRANKFURT AM MAIN HBF", (50.107145, 8.663789))

    def test_lorraine_tgv_is_in_moselle_not_in_rai_in_normandy(self):
        assert_near("LORRAINE TGV", (48.9494, 6.1699))

    def test_roissy_is_at_the_airport_not_in_issy_or_troissy(self):
        assert_near("AEROPORT ROISSY CDG 2 TGV", (49.0043, 2.5713))

    def test_marne_la_vallee_is_in_seine_et_marne_not_the_rhone_chessy(self):
        assert_near("MARNE LA VALLEE CHESSY", (48.8699, 2.7822))

    def test_nimes_is_in_the_gard_not_in_grigny(self):
        assert_near("NIMES CENTRE", (43.8318, 4.3661))

    def test_karlsruhe_and_mannheim_resolve_at_all(self):
        assert_near("KARLSRUHE HBF", (48.9931106, 8.4022064))
        assert_near("MANNHEIM HBF", (49.4796632, 8.4698178))

    def test_saint_die_is_in_the_vosges_not_in_die_in_the_drome(self):
        assert_near("ST DIE", (48.2821, 6.9472))

    def test_saint_maixent_is_in_deux_sevres_not_in_sevres_near_paris(self):
        assert_near("ST MAIXENT (DEUX SEVRES)", (46.4065, -0.2011))

    def test_the_re_and_oleron_stops_are_on_their_island(self):
        assert_near("LES PORTES EN RE", (46.250833, -1.497222))
        assert_near("ST PIERRE D'OLERON", (45.9437695, -1.3061227))
        assert_near("ST MARTIN DE RE", (46.2016893, -1.3681861))

    def test_the_mis_encoded_angouleme_label_lands_on_the_right_station(self):
        mangled = [label for label in TGVMAX_LABELS if any(0x80 <= ord(c) <= 0x9F for c in label)]
        assert mangled, "le libellé mal encodé a disparu du dataset"
        assert resolve_coords(INDEX, mangled[0])[0] == resolve_coords(INDEX, "ANGOULEME")[0]


class TestChoiceBetweenCloseCandidates:
    def test_prefers_valence_tgv_over_valence_centre(self):
        assert_near("VALENCE TGV AUVERGNE RHONE ALPES", (44.9911, 4.9793), 5)

    def test_prefers_the_tarn_et_garonne_caussade_over_its_homonym(self):
        assert_near("CAUSSADE(TARN ET GARONNE)", (44.1618, 1.5372), 10)

    def test_resolves_labels_spelling_saint_in_full(self):
        assert_near("ANGERS SAINT LAUD", (47.4646, -0.5581), 5)
        assert_near("MONTPELLIER SAINT ROCH", (43.6045, 3.8807), 5)

    def test_resolves_intramuros_labels_to_their_city(self):
        assert_near("PARIS (intramuros)", (48.8566, 2.3522))
        assert_near("LYON (intramuros)", (45.7578, 4.832))
        assert_near("LILLE (intramuros)", (50.6292, 3.0573))


class TestTheFallbackRefusesToGuess:
    def test_returns_nothing_rather_than_a_wrong_point(self):
        assert resolve_coords(INDEX, "ZZZZZ QUELQUE PART")[0] is None
        assert resolve_coords(INDEX, "GARE INEXISTANTE XYZ")[0] is None

    def test_never_matches_a_word_under_three_letters(self):
        assert resolve_coords(INDEX, "XX YY")[1] == "none"

    def test_returns_nothing_for_an_empty_label(self):
        assert resolve_coords(INDEX, "")[0] is None
        assert resolve_coords(INDEX, "  ")[0] is None


class TestDatasetCoverage:
    def test_holds_the_341_expected_labels(self):
        assert len(TGVMAX_LABELS) == 341

    def test_resolves_all_341_labels(self):
        unresolved = [label for label in TGVMAX_LABELS if resolve_coords(INDEX, label)[0] is None]
        assert unresolved == [], f"libellés sans coordonnées : {', '.join(unresolved)}"

    def test_no_new_label_reaches_the_heuristic_without_review(self):
        # Frozen on purpose: these 17 carry a qualifier the reference lacks and were checked
        # by hand. A change means a new label to review, not a list to extend on trust.
        reviewed = sorted(
            [
                "ALBI VILLE",
                "BELLEGARDE SUR VALSERINE GARE",
                "BIGANOS FACTURE",
                "CLUSES (HAUTE SAVOIE)",
                "COMMERCY ZONE DU SEUGNON",
                "DOLE VILLE",
                "LAROQUEBROU BATIMENT VOYAGEURS",
                "LEROUVILLE CENTRE",
                "MASSIAC BLESLE",
                "MONTELIMAR GARE SNCF",
                "NURIEUX GARE",
                "PORT VENDRES VILLE",
                "RANG DU FLIERS VERTON BERCK",
                "SAINT MIHIEL DETENTION",
                "SAMPIGNY CENTRE",
                "ST JEAN DE MAURIENNE ARVAN",
                "VALENCE VILLE",
            ]
        )
        heuristic = sorted(
            label for label in TGVMAX_LABELS if resolve_coords(INDEX, label)[1] == "partial"
        )
        assert heuristic == reviewed

    def test_all_341_labels_land_in_a_plausible_area(self):
        # Metropolitan France plus the countries TGVmax serves, Berlin included.
        outside = []
        for label in TGVMAX_LABELS:
            coords, _ = resolve_coords(INDEX, label)
            if coords is None:
                continue
            lat, lon = coords
            if lat < 41 or lat > 53.5 or lon < -5 or lon > 17:
                outside.append(label)
        assert outside == [], f"libellés hors zone : {', '.join(outside)}"


class TestResolutionTablesStayConsistent:
    def test_every_alias_points_at_an_existing_reference_key(self):
        # A misspelled alias would silently fall back to the heuristic.
        for label in [
            "AEROPORT ROISSY CDG 2 TGV",
            "LORRAINE TGV",
            "VALENCE TGV AUVERGNE RHONE ALPES",
            "NIMES CENTRE",
            "CAUSSADE(TARN ET GARONNE)",
        ]:
            assert resolve_coords(INDEX, label)[1] == "alias", f"{label} ne passe pas par son alias"

    def test_extra_station_keys_are_already_normalised(self):
        for key in EXTRA_STATIONS:
            assert station_key(key) == key, f"clé non normalisée : {key}"

    def test_extra_station_coords_are_lat_lon_in_that_order(self):
        for key, (lat, lon) in EXTRA_STATIONS.items():
            assert 40 < lat < 53, f"{key} : latitude hors plage"
            assert -5 < lon < 17, f"{key} : longitude hors plage"


class TestBuildCoordsIndex:
    def test_parses_the_whole_reference(self):
        # The file has already shipped truncated once, at a 1 MB upload limit.
        assert isinstance(GARES, list)
        assert len(GARES) > 6000

    def test_skips_records_without_usable_coordinates(self):
        built = build_coords_index(
            [
                {"libelle": "Sans coords", "commune": "NULLE PART"},
                {"libelle": "Coords partielles", "commune": "AILLEURS", "x_wgs84": 2},
                {"libelle": "Valide", "commune": "ICI", "x_wgs84": 2.35, "y_wgs84": 48.85},
            ]
        )
        assert "sans coords" not in built
        assert "coords partielles" not in built
        assert built["valide"] == (48.85, 2.35)

    def test_converts_x_and_y_into_lat_lon(self):
        built = build_coords_index([{"libelle": "Test", "x_wgs84": 2.3735, "y_wgs84": 48.8443}])
        assert built["test"] == (48.8443, 2.3735)

    def test_a_commune_does_not_overwrite_a_station_with_the_same_key(self):
        built = build_coords_index(
            [{"libelle": "Chessy", "commune": "CHESSY", "x_wgs84": 4.62249, "y_wgs84": 45.88544}]
        )
        assert built["chessy"] == (45.88544, 4.62249)


@pytest.mark.parametrize("label", ["PARIS (intramuros)", "LYON (intramuros)"])
def test_resolution_is_stable_across_calls(label):
    assert resolve_coords(INDEX, label) == resolve_coords(INDEX, label)
