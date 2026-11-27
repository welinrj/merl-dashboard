"""Build 2026 population and household estimates for the dashboard's 2025 Area Councils.

The census reports population on the VNSO AC2022 units (71 units incl. the
Port Vila and Luganville municipalities). The dashboard draws the 2025 AC
boundaries, whose partition differs in Shefa, Tafea and around both towns.
Figures are moved between the two partitions with the 2020 census dwelling GPS
points: each AC2022 unit's totals are shared out to the 2025 councils in
proportion to where that unit's dwellings fall (area share where a unit has no
points). National and provincial totals are preserved exactly.

Usage (paths to the source files on the GIS drive):
  python scripts/build-area-council-population.py \
      VUT_AreaCouncils_2022_PopHH_2026est.geojson GPS_PHC2020clean_4326.shp

Inputs: VUT_AreaCouncils_2022_PopHH_2026est.geojson carries pop2020/hh2020 from
the VNSO 2020 census and pop2026/hh2026 projected geometrically with the VNSO
2009-2020 average annual growth rates (2020 Census Basic Tables Vol 1, Table 1):
Port Vila 1.0 %, Luganville 2.7 %, provinces (rural) Torba 1.7, Sanma 2.3,
Penama 1.3, Malampa 1.3, Shefa 4.0, Tafea 3.1 %; households at 2020 household size.
"""
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "frontend/public/data/vanuatu-area-councils-2025.geojson"
OUT = ROOT / "frontend/public/data/vanuatu-area-councils-population-2026.json"
UTM = "EPSG:32759"
FIELDS = ["pop2020", "hh2020", "pop2026", "hh2026"]

src = gpd.read_file(sys.argv[1]).to_crs(UTM)
pts = gpd.read_file(sys.argv[2])[["geometry"]].to_crs(UTM)
tgt = gpd.read_file(MAP)[["ADM1_EN", "ADM2_EN", "geometry"]].to_crs(UTM)
tgt["tid"] = range(len(tgt))
tgt["geometry"] = tgt.geometry.make_valid()

# Dwelling -> census unit and -> dashboard council. Rural dwellings just off the
# 100 m simplified coastline snap to the nearest council (<= 2 km). The 2025
# layer leaves the Port Vila and Luganville municipalities undrawn, so town
# dwellings only count for a council when they actually fall inside it (150 m
# tolerance); the rest stay in a separate municipality row, not on the map.
MUNI = {r.ac_code: r.ac_name for r in src.itertuples() if r.unit_type == "Municipality"}
a = gpd.sjoin_nearest(pts, src[["ac_code", "geometry"]], max_distance=2000, how="inner").drop(columns="index_right")
a = gpd.sjoin_nearest(a, tgt[["tid", "geometry"]], max_distance=2000, how="left", distance_col="d")
a = a[~a.index.duplicated()]
a["tid"] = a.tid.astype(object)
town = a.ac_code.isin(MUNI) & (a.d.isna() | (a.d > 150))
a.loc[town, "tid"] = a.loc[town, "ac_code"].map(lambda c: f"M{c}")
a = a.dropna(subset=["tid"])
cross = a.groupby(["ac_code", "tid"]).size().rename("n").reset_index()
cross["w"] = cross.n / cross.groupby("ac_code").n.transform("sum")

# Area fallback for units without dwelling points.
missing = set(src.ac_code) - set(cross.ac_code)
if missing:
    ov = gpd.overlay(src[src.ac_code.isin(missing)][["ac_code", "geometry"]], tgt[["tid", "geometry"]], how="intersection")
    ov["n"] = ov.area
    ov["w"] = ov.n / ov.groupby("ac_code").n.transform("sum")
    cross = pd.concat([cross, ov[["ac_code", "tid", "n", "w"]]])

m = cross.merge(src[["ac_code", *FIELDS]], on="ac_code")
for f in FIELDS:
    m[f] = m[f] * m.w
agg = m.groupby("tid")[FIELDS].sum()
# Integerise with largest-remainder so totals match the source exactly.
for f in FIELDS:
    floor = agg[f].astype(int)
    short = int(round(src[f].sum())) - int(floor.sum())
    order = (agg[f] - floor).sort_values(ascending=False).index[:short]
    floor.loc[order] += 1
    agg[f] = floor

towns = agg[agg.index.map(lambda i: isinstance(i, str))]
agg = agg[agg.index.map(lambda i: not isinstance(i, str))]
agg.index = agg.index.astype(float).astype(int)
tgt = tgt.join(agg, on="tid").fillna({f: 0 for f in FIELDS})
tgt["area_km2"] = (tgt.area / 1e6).round(2)


def row(province, name, r, km2=None):
    pop20, pop26, hh26 = int(r["pop2020"]), int(r["pop2026"]), int(r["hh2026"])
    return {
        "province": province, "area_council": name,
        "pop2020": pop20, "hh2020": int(r["hh2020"]), "pop2026": pop26, "hh2026": hh26,
        "growth_pct": round(((pop26 / pop20) ** (1 / 6) - 1) * 100, 2) if pop20 else None,
        "hh_size": round(pop26 / hh26, 2) if hh26 else None,
        "density_2026": round(pop26 / km2, 1) if km2 else None,
    }


councils = {f"{r.ADM1_EN}|{r.ADM2_EN}": row(r.ADM1_EN, r.ADM2_EN, r._asdict(), r.area_km2) for r in tgt.itertuples()}
assert len(councils) == 71
prov = {r.ac_code: r.prov_name.upper() for r in src.itertuples()}
municipalities = {MUNI[int(i[1:])]: row(prov[int(i[1:])], MUNI[int(i[1:])], r) for i, r in towns.iterrows()}
out = {
    "reference_year": 2026, "base_year": 2020,
    "totals": {f: int(tgt[f].sum() + towns[f].sum()) for f in FIELDS},
    "municipalities": municipalities,
    "method": "VNSO 2020 census counts by AC2022 unit, projected to Nov 2026 as P2026 = P2020 x (1+r)^6 with VNSO 2009-2020 average annual growth rates (Port Vila 1.0%, Luganville 2.7%, provincial rural rates elsewhere); households held at 2020 average household size; reallocated to the 2025 Area Council boundaries using 2020 census dwelling GPS points.",
    "source": "VNSO 2020 National Population and Housing Census; Basic Tables Vol 1, Table 1; estimate prepared by DEPC/VSS GIS (Nov 2026). Estimates, not official VNSO figures.",
    "councils": councils,
}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(out["totals"], OUT)
