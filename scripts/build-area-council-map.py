"""Build display geometry without editing the reviewed Area Council source.

Run with Shapely 2.2 and pyproj 3.7. The original boundary dataset remains
authoritative for names/records. Only rendering topology is repaired here.
"""
import hashlib
import json
from pathlib import Path

import shapely
from pyproj import Geod
from shapely import make_valid, unary_union
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend/public/data/vanuatu-area-councils-2025.geojson"
OUTPUT = SOURCE.with_name("vanuatu-area-councils-map.geojson")


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        return [p for part in geometry.geoms for p in polygons(part)]
    return []


source = json.loads(SOURCE.read_text())
geod = Geod(ellps="WGS84")
features, geometries, repairs = [], [], []
for feature in source["features"]:
    original = shape(feature["geometry"])
    display = unary_union(polygons(make_valid(original)))
    assert display.is_valid and not display.is_empty
    # Reject any repair that moves or removes an existing boundary segment.
    assert original.boundary.difference(display.boundary).length < 1e-12
    delta_m2 = abs(abs(geod.geometry_area_perimeter(display)[0])
                   - abs(geod.geometry_area_perimeter(original)[0]))
    assert delta_m2 < 1, (feature["properties"], delta_m2)
    if not original.is_valid:
        repairs.append({**feature["properties"], "absolute_area_change_m2": delta_m2})
    features.append({**feature, "geometry": mapping(display)})
    geometries.append(display)

assert len(features) == 71
land = unary_union(geometries)
mesh = unary_union([g.boundary for g in geometries])
overlaps = []
for i, a in enumerate(geometries):
    for j, b in enumerate(geometries[:i]):
        overlap = a.intersection(b)
        if overlap.area > 1e-12:
            area_m2 = abs(geod.geometry_area_perimeter(overlap)[0])
            assert area_m2 < 100, (i, j, area_m2)
            overlaps.append({"a": features[i]["properties"]["ADM2_EN"],
                             "b": features[j]["properties"]["ADM2_EN"],
                             "area_m2": area_m2})

labels = []
for province in sorted({f["properties"]["ADM1_EN"] for f in features}):
    footprint = unary_union([g for g, f in zip(geometries, features)
                            if f["properties"]["ADM1_EN"] == province])
    labels.append({"type": "Feature", "properties": {"name": province.title()},
                   "geometry": mapping(footprint.representative_point())})

result = {"type": "FeatureCollection", "features": features,
          "display": {"land": {"type": "Feature", "properties": {}, "geometry": mapping(land)},
                      "boundaries": {"type": "Feature", "properties": {}, "geometry": mapping(mesh)},
                      "provinceLabels": labels},
          "provenance": {"source": SOURCE.name,
                         "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                         "shapely_version": shapely.__version__,
                         "method": "make_valid; polygon parts only; union land and shared boundary linework; no buffering, snapping or further simplification",
                         "repairs": repairs, "residual_source_slivers": overlaps,
                         "scope": "Display only. Source records, names and boundary coordinates are retained."}}
OUTPUT.write_text(json.dumps(result, separators=(",", ":")) + "\n")
print(json.dumps({"output": str(OUTPUT), "features": len(features),
                  "repairs": repairs, "residual_source_slivers": overlaps,
                  "bytes": OUTPUT.stat().st_size}, indent=2))
