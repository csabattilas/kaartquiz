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
MARKER = 0.015          # marker size as a share of map width; keep in sync with markerSize in app.js


def polygons(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


def _in_ring(pt, ring):
    x, y = pt
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def _ring_area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def _seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = 0 if dx == dy == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def visual_centre(geom):
    """[lat, lon] of the point deepest inside the largest polygon, where a country's square goes."""
    ring = max((p[0] for p in polygons(geom)), key=_ring_area)
    xs = [q[0] for q in ring]
    ys = [q[1] for q in ring]
    cl = math.cos(math.radians(sum(ys) / len(ys)))
    scaled = [(x * cl, y) for x, y in ring]
    step = max(max(xs) - min(xs), max(ys) - min(ys)) / 60
    best = (-1, None)
    y = min(ys)
    while y <= max(ys):
        x = min(xs)
        while x <= max(xs):
            if _in_ring((x, y), ring):
                d = min(_seg_dist((x * cl, y), scaled[i], scaled[i - 1]) for i in range(len(scaled)))
                if d > best[0]:
                    best = (d, (x, y))
            x += step
        y += step
    x, y = best[1]
    return [round(y, 2), round(x, 2)]


def place_square(geom, taken, to_xy, gap, skip=False):
    """Deepest point of the country that keeps a marker's distance from every other marker."""
    ring = max((p[0] for p in polygons(geom)), key=_ring_area)
    centre = visual_centre(geom)
    if skip or all(math.dist(to_xy(centre), t) >= gap for t in taken):
        return centre
    edge = [to_xy((y, x)) for x, y in ring]
    xs = [q[0] for q in ring]
    ys = [q[1] for q in ring]
    step = max(max(xs) - min(xs), max(ys) - min(ys)) / 50
    best = (-1, centre)
    y = min(ys)
    while y <= max(ys):
        x = min(xs)
        while x <= max(xs):
            if _in_ring((x, y), ring):
                p = to_xy((y, x))
                depth = min(_seg_dist(p, edge[i], edge[i - 1]) for i in range(len(edge)))
                clear = min((math.dist(p, t) for t in taken), default=gap)
                score = min(clear, gap) * 1000 + min(depth, gap)     # first stay clear, then stay inside
                if score > best[0]:
                    best = (score, [round(y, 2), round(x, 2)])
            x += step
        y += step
    return best[1]


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
    geoms = {}
    for f in world['features']:
        code = f['properties']['ADM0_A3']
        if code in cfg.get('hide', []):          # countries left off this map entirely
            continue
        polys = [p for p in polygons(f['geometry']) if touches(p)]
        if not polys:
            continue
        shapes.append({'code': code, 'quiz': code in quiz, 'd': ''.join(path(p) for p in polys)})
        seen.add(code)
        if code in quiz:
            geoms[code] = f['geometry']
    missing = quiz - seen
    assert not missing, f'country codes not found in map data: {missing}'
    # Every quiz country gets a square marker, as near its middle as possible but clear of
    # the other markers. places/*.json may set "at" on a country to place it by hand.
    to_xy = lambda a: ((a[1] - b['lonMin']) * k * cos, (b['latMax'] - a[0]) * k)
    gap = 2.9 * width * MARKER
    taken = [to_xy(f['at']) for f in cfg['features']]
    countries = []
    order = sorted(cfg['countries'], key=lambda c: _ring_area(max((p[0] for p in polygons(geoms[c['code']])), key=_ring_area)))
    placed = {}
    for c in order:                                # small countries first: they have the least room
        at = c.get('at') or place_square(geoms[c['code']], taken, to_xy, gap, skip=c.get('small'))
        placed[c['code']] = at
        if not c.get('small'):
            taken.append(to_xy(at))
    countries = [{**c, 'at': placed[c['code']]} for c in cfg['countries']]

    # Hint data. Neighbours share border vertices in Natural Earth, so compare rounded vertices.
    verts = {code: {(round(x, 2), round(y, 2)) for p in polygons(g) for x, y in p[0]} for code, g in geoms.items()}
    for c in countries:
        c['nb'] = sorted(o for o in geoms if o != c['code'] and verts[c['code']] & verts[o])

    def country_of(at):
        lat, lon = at
        for code, g in geoms.items():
            if any(_in_ring((lon, lat), p[0]) for p in polygons(g)):
                return {'in': code}
        near = min(geoms, key=lambda code: min(math.hypot((x - lon) * math.cos(math.radians(lat)), y - lat)
                                               for x, y in list(verts[code])[::5]))
        return {'near': near}

    hidden = [g['geometry'] for g in world['features'] if g['properties']['ADM0_A3'] in cfg.get('hide', [])]

    def in_hidden(x, y):
        return any(_in_ring((x, y), p[0]) for g in hidden for p in polygons(g))

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
        lines = [ln for ln in lines if any(inbox(x, y) for x, y in ln) and not in_hidden(*ln[len(ln) // 2])]
        if lines:
            river_paths.append(''.join(line_path(ln) for ln in lines))

    lake_paths = [''.join(path(p) for p in polys)
                  for f in lakes['features']
                  for polys in [[p for p in polygons(f['geometry']) if touches(p) and not in_hidden(*p[0][0])]] if polys]

    # A Feature with "shape" (a region name in the Natural Earth regions file) can be
    # answered by touching anywhere inside that region, like a country.
    def with_shape(f):
        if 'shape' not in f:
            return f
        geoms_ = [g['geometry'] for g in regions['features'] if g['properties']['NAME'] == f['shape']]
        assert geoms_, f'region shape not found: {f["shape"]}'
        polys = [p for g in geoms_ for p in polygons(g) if touches(p)]
        return {**f, 'd': ''.join(path(p) for p in polys)}

    range_paths = [''.join(path(p) for p in polys)
                   for f in regions['features'] if f['properties']['FEATURECLA'] == 'Range/mtn'
                   for polys in [[p for p in polygons(f['geometry']) if touches(p) and not in_hidden(*p[0][len(p[0]) // 2])]] if polys]

    return {
        'id': cfg['id'], 'name': cfg['name'], 'emoji': cfg['emoji'],
        'width': width, 'height': height, 'k': k, 'cos': cos,
        'lon0': b['lonMin'], 'lat0': b['latMax'],
        'countries': countries, 'features': [{**with_shape(f), **country_of(f['at'])} for f in cfg['features']], 'shapes': shapes,
        'rivers': river_paths, 'lakes': lake_paths, 'ranges': range_paths,
        'toets': cfg.get('toets'),
        'compass': cfg.get('compass'),
    }


for src in sorted((root / 'places').glob('*.json')):
    data = build(json.load(open(src)))
    out = root / 'regions' / f'{data["id"]}.js'
    out.write_text('(window.REGIONS = window.REGIONS || []).push(' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
    print(out.name, out.stat().st_size // 1024, 'KB')
