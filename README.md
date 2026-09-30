# Kaartquiz

A touch-friendly map quiz (Dutch UI) for South America and Asia. The child is asked where a
Place is and touches the unlabeled map. Runs as a home-screen web app on an iPad; no build step
and no dependencies.

See [CONTEXT.md](CONTEXT.md) for the vocabulary (Place, Country, Feature, Marker, Region, ...).

## Try it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly also works, but the offline cache
only runs over http/https.)

## Where things live

| Path | What it is |
|---|---|
| `places/*.json` | **Edit these** to change Places: Countries (Dutch names), Features (name, anchor `[lat, lon]`, `type`, `r` hit radius in km) |
| `regions/*.js` | Generated from `places/*.json` plus the map data. Don't edit by hand |
| `tools/build_regions.py` | Regenerates `regions/*.js` |
| `app.js` | Game logic, settings screen, marker shapes (`TYPES`) |
| `style.css`, `index.html` | Look and layout |
| `sw.js` | Offline cache and updates. **Bump `CACHE` whenever any app file changes**: installed apps then download the new version and show "Nieuwe versie — Bijwerken" on the home screen |

## Changing the Places

1. Edit `places/south-america.json` (or `asia.json`).
2. Regenerate the map files. This needs four Natural Earth 1:50m files (public domain) from
   https://github.com/nvkelso/natural-earth-vector/tree/master/geojson :
   `ne_50m_admin_0_countries`, `ne_50m_rivers_lake_centerlines`, `ne_50m_lakes` and
   `ne_50m_geography_regions_polys` (all `.geojson`).

   ```bash
   python3 tools/build_regions.py --countries ne_50m_admin_0_countries.geojson \
     --rivers ne_50m_rivers_lake_centerlines.geojson --lakes ne_50m_lakes.geojson \
     --regions ne_50m_geography_regions_polys.geojson
   ```
3. Bump `CACHE` in `sw.js`, then reload.

Feature `type` is one of `mountain`, `river`, `water`, `sight`, `area`, `island`, `volcano`.
Country squares are placed automatically (middle of the country, clear of other markers). Run
`python3 tools/check_markers.py` after moving a Feature to see markers that overlap. A Feature can
have `"shape"` (a region name from the Natural Earth regions file) so a touch anywhere inside it counts.

## Read-aloud

The 🔊 button plays recordings from `audio/` (listed in `audio/index.json`). Without recordings the
tablet's own voice is used. To (re)make the recordings after texts or places change:

```bash
python3 tools/make_audio.py serve            # then open http://localhost:8000/?collect, then Ctrl+C
python3 tools/make_audio.py build --engine google --voice nl-NL-Wavenet-B   # needs GOOGLE_TTS_KEY
```

`python3 tools/make_audio.py voices` lists the Google Dutch voices. Only new sentences are recorded.
Bump `CACHE` in `sw.js` and push.

## Deploy

It is a static site: serve the repository root over HTTPS (GitHub Pages, Netlify, Cloudflare Pages).
On the iPad open the URL in Safari, then Share → Add to Home Screen.

## Data

Map geometry: [Natural Earth](https://www.naturalearthdata.com/), public domain.
Settings and custom places are stored in the browser (`localStorage`) on each device.
