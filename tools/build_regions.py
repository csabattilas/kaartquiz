#!/usr/bin/env python3
"""Build regions/<id>.js (map geometry + Places) from places/<id>.json.

Usage: python3 tools/build_regions.py path/to/ne_50m_admin_0_countries.geojson

The GeoJSON is Natural Earth 1:50m admin-0 countries (public domain):
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
"""
import json, math, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
world = json.load(open(sys.argv[1]))


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

    return {
        'id': cfg['id'], 'name': cfg['name'], 'emoji': cfg['emoji'],
        'width': width, 'height': height, 'k': k, 'cos': cos,
        'lon0': b['lonMin'], 'lat0': b['latMax'],
        'countries': cfg['countries'], 'features': cfg['features'], 'shapes': shapes,
    }


for src in sorted((root / 'places').glob('*.json')):
    data = build(json.load(open(src)))
    out = root / 'regions' / f'{data["id"]}.js'
    out.write_text('(window.REGIONS = window.REGIONS || []).push(' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
    print(out.name, out.stat().st_size // 1024, 'KB')
