# MarketMind

Competitor intelligence dashboard tracking five European AI startups: Lovable, ElevenLabs, Mistral AI, Lexroom, Helsing.

Tagline: *Know your competition, own your market.*

Live: https://williamhellawell.github.io/marketmind/

## What it is

A static HTML/CSS/JS site with two views:

1. **Map** (`index.html`): a Leaflet map of Europe with clickable pills over each company's HQ. Click a pill to open a slide-over profile with funding, team, product, and traction details. Filter by sector, country, and funding range.
2. **Compare** (`compare.html`): select any subset of the five companies and metric groups, then read a side-by-side table or scan the funding bar chart, headcount bar chart, and normalised KPI radar.

No build step. No backend. Hosted on GitHub Pages.

## Data

All company data lives in [`assets/data/startups.json`](assets/data/startups.json). Each record has `last_updated` and `sources[]` with the public references used. To refresh, edit the JSON and commit.

Currency: all funding amounts are EUR. USD figures are converted at the rate noted in the file's `meta` block.

## Local dev

```bash
python3 -m http.server 8000
open http://localhost:8000
```

## Stack

- Leaflet 1.9 + CARTO light tiles for the map
- Chart.js 4 for charts
- Inter via Google Fonts
- Vanilla JS, no framework
