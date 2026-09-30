#!/usr/bin/env python3
"""Build regions/<id>.js (map geometry + Places) from places/<id>.json.

Usage:
  python3 tools/build_regions.py --countries ne_50m_admin_0_countries.geojson \
      --rivers ne_50m_rivers_lake_centerlines.geojson \
      --lakes ne_50m_lakes.geojson \
      --regions ne_50m_geography_regions_polys.geojson

All four are Natural Earth 1:50m files (public domain), from
https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
"""
import argparse, json, math, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
for name in ('countries', 'rivers', 'lakes', 'regions'):
    ap.add_argument('--' + name, required=True)
args = ap.parse_args()
world = json.load(open(args.countries))
rivers = json.load(open(args.rivers))
lakes = json.load(open(args.lakes))
regions = json.load(open(args.regions))
MAX_RIVER_RANK = 5      # 1 = biggest rivers only; higher adds smaller ones


def polygons(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


def build(cfg):
    b = cfg['bbox']
    k = cfg['k']
    cos = math.cos(math.radians(cfg['stdLat']))
    width = round((b['lonMax'] - b['lonMin']) * k * cos, 1)
    height = round((b['latMax'] - b['latMin']) * k, 1)

    def touches(poly):
        return any(b['lonMin'] <= x <= b['lonMax'] and b['latMin'] <= y <= b['latMax'] for x, y in poly[0])

    def path(poly):
        out = []
        for ring in poly:
            pts = [((x - b['lonMin']) * k * cos, (b['latMax'] - y) * k) for x, y in ring]
            out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
        return ''.join(out)

    quiz = {c['code'] for c in cfg['countries']}
    seen = set()
    shapes = []
    for f in world['features']:
        code = f['properties']['ADM0_A3']
        polys = [p for p in polygons(f['geometry']) if touches(p)]
        if not polys:
            continue
        shapes.append({'code': code, 'quiz': code in quiz, 'd': ''.join(path(p) for p in polys)})
        seen.add(code)
    missing = quiz - seen
    assert not missing, f'country codes not found in map data: {missing}'

    def inbox(x, y):
        return b['lonMin'] <= x <= b['lonMax'] and b['latMin'] <= y <= b['latMax']

    def line_path(coords):
        pts = [((x - b['lonMin']) * k * cos, (b['latMax'] - y) * k) for x, y in coords]
        return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)

    river_paths = []
    for f in rivers['features']:
        p = f['properties']
        if p['featurecla'] != 'River' or p['scalerank'] > MAX_RIVER_RANK:
            continue
        g = f['geometry']
        lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        lines = [ln for ln in lines if any(inbox(x, y) for x, y in ln)]
        if lines:
            river_paths.append(''.join(line_path(ln) for ln in lines))

    lake_paths = [''.join(path(p) for p in polys)
                  for f in lakes['features']
                  for polys in [[p for p in polygons(f['geometry']) if touches(p)]] if polys]

    range_paths = [''.join(path(p) for p in polys)
                   for f in regions['features'] if f['properties']['FEATURECLA'] == 'Range/mtn'
                   for polys in [[p for p in polygons(f['geometry']) if touches(p)]] if polys]

    return {
        'id': cfg['id'], 'name': cfg['name'], 'emoji': cfg['emoji'],
        'width': width, 'height': height, 'k': k, 'cos': cos,
        'lon0': b['lonMin'], 'lat0': b['latMax'],
        'countries': cfg['countries'], 'features': cfg['features'], 'shapes': shapes,
        'rivers': river_paths, 'lakes': lake_paths, 'ranges': range_paths,
    }


for src in sorted((root / 'places').glob('*.json')):
    data = build(json.load(open(src)))
    out = root / 'regions' / f'{data["id"]}.js'
    out.write_text('(window.REGIONS = window.REGIONS || []).push(' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
    print(out.name, out.stat().st_size // 1024, 'KB')
