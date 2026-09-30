#!/usr/bin/env python3
"""Report markers that sit too close together (they would overlap on the map)."""
import json, math, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
for f in sorted((root / 'regions').glob('*.js')):
    t = f.read_text(); d = json.loads(t[t.index('push(') + 5:t.rindex(');')])
    gap = 2.9 * d["width"] * 0.015
    xy = lambda a: ((a[1] - d['lon0']) * d['k'] * d['cos'], (d['lat0'] - a[0]) * d['k'])
    pts = [('c:' + c['code'], c['at']) for c in d['countries'] if not c.get('small')] + [('f:' + x['id'], x['at']) for x in d['features']]
    bad = [(a[0], b[0], round(math.dist(xy(a[1]), xy(b[1])), 1)) for i, a in enumerate(pts) for b in pts[i + 1:] if math.dist(xy(a[1]), xy(b[1])) < gap]
    print(f.name, 'min gap', round(gap, 1), 'too close:', bad or 'none')
