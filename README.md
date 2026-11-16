# Smart Home Information Dashboard

A static, GitHub Pages-friendly dashboard for a family home in Viherlaakso, Espoo, Finland. It combines weather, electricity pricing, public transport, a motivational daily quote, and a daily family schedule in a dark, television-friendly layout.

## Architecture

This project intentionally avoids a traditional backend. The dashboard is designed to run as a static site on GitHub Pages and remains compatible with Yodeck or any modern browser.

### Selected architecture

- Frontend: static HTML, CSS, and JavaScript modules
- Hosting: GitHub Pages
- Weather source: Open-Meteo (browser-friendly, no API key, CORS-friendly)
- Electricity source: hourly prices parsed from Pörssisähkö.net into a local JSON feed by GitHub Actions; suitable for static hosting
- Public transport source: live HSL/Digitransit stop times for Viherlaaksontori, Kavallinmäki, Kauniainen, and Leppävaara
- Family schedules: U, N, and TC ICS calendars expanded into date-specific JSON during build
- Daily quote: local text file with deterministic rotation logic

### Why this architecture

- It matches the requirement to avoid maintaining a server.
- It works on GitHub Pages without backend credentials.
- It remains simple to maintain and update.
- It requires no paid hosting.

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
- `schedules/U.ics`, `schedules/N.ics`, and `schedules/TC.ics` — source calendars
- `data/schedules/calendar.json` — generated date-specific schedules; build with `npm run build:schedules`
- `data/electricity/fi-prices.json` — electricity feed updated from Pörssisähkö.net hourly

The summary shows each child's first calendar start and last scheduled end for today, plus the next upcoming TC event. The Schedule page shows U and N events for the selected date and the next eight TC events in its third column.

The Pages workflow refreshes today's and tomorrow's electricity prices hourly before deployment. The summary chart always shows today's prices. On the detail page, today's chart remains visible and tomorrow's chart is added at 13:00 Europe/Helsinki when the source has published those prices. The source site does not provide browser CORS access, so the dashboard itself never contacts it directly. If the source is unavailable or its table format changes, the workflow keeps the last working feed and still deploys.

## Privacy warning

The dashboard is static and public by default. Daily quotes and any personal family information stored in GitHub Pages are publicly readable. The Digitransit subscription key is sent from browser code and is visible to visitors; use a key intended for public client-side use with appropriate quotas, or put the API request behind a server-side proxy. Rotate the key if it was not intended to be public.

If you need confidential schedule details or private wording, keep them on a local-only device or a private local network and disable the public file.

## Testing

```bash
npm test
```

## Planned enhancements

- Add a future local configuration editor for family schedules.
