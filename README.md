# Smart Home Information Dashboard

A static, GitHub Pages-friendly dashboard for a family home in Viherlaakso, Espoo, Finland. It combines weather, electricity pricing, public transport, a motivational daily quote, and a daily family schedule in a dark, television-friendly layout.

## Architecture

This project intentionally avoids a traditional backend. The dashboard is designed to run as a static site on GitHub Pages and remains compatible with Yodeck or any modern browser.

### Selected architecture

- Frontend: static HTML, CSS, and JavaScript modules
- Hosting: GitHub Pages
- Weather source: Open-Meteo (browser-friendly, no API key, CORS-friendly)
- Electricity source: hourly prices parsed from Pörssisähkö.net into a local JSON feed by GitHub Actions; suitable for static hosting
- Public transport source: HSL/Digitransit GraphQL API when stop IDs are configured; fallback sample data otherwise
- Family schedules: local JSON files
- Daily quote: local text file with deterministic rotation logic

### Why this architecture

- It matches the requirement to avoid maintaining a server.
- It works on GitHub Pages without backend credentials.
- It remains simple to maintain and update.
- It requires no paid hosting.

> Note: HSL stop IDs and any truly sensitive data must be validated or kept local before moving the dashboard to production. The sample stop IDs and family schedule files are placeholders.

## Run locally

```bash
cd /path/to/project
python3 -m http.server 8000
```

Open http://localhost:8000

## GitHub Pages deployment

1. Push the repository to GitHub.
2. In GitHub, open the repository settings.
3. Navigate to Pages.
4. Set the source to GitHub Actions.
5. Use the provided workflow file at `.github/workflows/deploy.yml`.

## Configuration

Edit `config/dashboard.json` to change:

- Weather coordinates
- Display and rotation settings
- Page order and durations
- Electricity price thresholds and VAT
- HSL stop IDs
- Daily quote rotation start date

## Data files

- `data/daily-quotes.txt` — one motivational quote per line
- `data/schedules/child1.json` — example family schedule
- `data/schedules/child2.json` — example family schedule
- `data/schedules/child3.json` — example family schedule
- `data/electricity/fi-prices.json` — electricity feed updated from Pörssisähkö.net hourly

The Pages workflow refreshes today's and tomorrow's electricity prices hourly before deployment. The summary chart always shows today's prices. On the detail page, today's chart remains visible and tomorrow's chart is added at 13:00 Europe/Helsinki when the source has published those prices. The source site does not provide browser CORS access, so the dashboard itself never contacts it directly. If the source is unavailable or its table format changes, the workflow keeps the last working feed and still deploys.

## Privacy warning

The dashboard is static and public by default. Daily quotes and any personal family information stored in GitHub Pages are publicly readable.

If you need confidential schedule details or private wording, keep them on a local-only device or a private local network and disable the public file.

## Testing

```bash
npm test
```

## Planned enhancements

- Add a small scheduled feed refresh for electricity via GitHub Actions.
- Replace placeholder HSL stop IDs with verified production IDs.
- Add a future local configuration editor for family schedules.
